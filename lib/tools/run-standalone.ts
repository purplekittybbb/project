/**
 * Execute a standalone tool — shared-cache hit, then live scrape when a
 * concurrency slot + browser are available, else queued/preview.
 *
 * CONCURRENCY NOTE (two layers, both required for "everyone at once"):
 *
 * 1. Cache layer — ALL FOUR scraper tools now consult a shared cache before
 *    touching a browser:
 *      - visibility / index-check → shared_visibility_scans (0027)
 *      - price-track              → shared_price_track_scans (0031)
 *      - top100                   → shared_top100_scans (0031)
 *    A fresh cache hit is served straight from Postgres — any number of
 *    concurrent visitors can be served this way with zero scraping load.
 *
 * 2. Concurrency guard — a cache MISS does NOT get an unconditional browser.
 *    It must first acquire a cross-instance lease (migration 0029,
 *    lib/supabase/scan-concurrency.ts) capped at SCRAPE_MAX_CONCURRENT per
 *    marketplace. This is what stops a burst of simultaneous *different*
 *    keywords (worst case: everyone searching something new at once) from
 *    opening dozens of headless browsers against the marketplace at the
 *    same instant — the exact bulk-request pattern that risks an IP ban.
 *    A visitor who can't get a slot gets mode: "queued" immediately (no
 *    hanging request) with a retry hint, instead of the request either
 *    crashing the scraper host or silently piling on load.
 *
 * A successful live scrape is written back to the relevant shared cache so
 * the next visitor asking the same question gets the free cached path, and
 * every ask (hit or miss) is recorded in keyword_search_stats (0030) so the
 * background pre-crawl worker (app/api/cron/precrawl-visibility) knows what
 * to refresh proactively, before anyone even asks.
 *
 * STALE-WHILE-REVALIDATE (free improvement, zero infra cost): a row past
 * its TTL but still within cache-ttl.ts's STALE_GRACE_MULTIPLIER window is
 * served INSTANTLY — honestly labelled mode: "stale", never disguised as
 * fresh — instead of making that one visitor wait through a live scrape.
 * A background refresh is scheduled via next/server's after() (runs after
 * the response is sent, same invocation, no added latency for this
 * visitor) so the next visitor gets a fresh row. This only matters for
 * long-tail keywords the pre-crawl worker hasn't reached yet; in steady
 * state most rows never even reach their base TTL.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { analyzeTop100, type Top100AnalysisResult } from "@/lib/demand/top100";
import { createBrowserSession } from "@/lib/scrapers/browser";
import { trackCompetitorPrices, type PriceTrackResult } from "@/lib/scrapers/price-tracker";
import { checkIndex, searchProductRank } from "@/lib/scrapers/visibility";
import {
  PRICE_TRACK_TTL_MS,
  STALE_GRACE_MULTIPLIER,
  TOP100_TTL_MS,
  VISIBILITY_TTL_MS,
} from "@/lib/tools/cache-ttl";
import { recordKeywordSearch } from "@/lib/supabase/keyword-stats";
import { acquireScrapeSlot, releaseScrapeSlot } from "@/lib/supabase/scan-concurrency";
import {
  loadSharedPriceTrackScan,
  loadSharedTop100Scan,
  upsertSharedPriceTrackScan,
  upsertSharedTop100Scan,
} from "@/lib/supabase/shared-scraper-cache";
import { loadSharedVisibilityScan, upsertSharedVisibilityScan } from "@/lib/supabase/shared-visibility";
import { buildPreviewResult } from "./demo-results";
import type { ParsedToolQuery } from "./parse-query";
import type { StandaloneToolId } from "./registry";

type ScraperToolId = Exclude<StandaloneToolId, "profit-calc">;

export interface ToolRunEnvelope {
  toolId: ScraperToolId;
  mode: "live" | "cached" | "stale" | "queued" | "preview";
  data: unknown;
}

/** Shown to a guest who hit the concurrency cap — honest, not a fake spinner. */
function buildQueuedEnvelope(toolId: ScraperToolId, retryAfterSeconds: number): ToolRunEnvelope {
  return {
    toolId,
    mode: "queued",
    data: {
      message: "Şu anda yoğunluk var, tarayıcılar dolu. Birkaç saniye sonra otomatik tekrar deneyin.",
      retryAfterSeconds,
    },
  };
}

// TTLs live in lib/tools/cache-ttl.ts (shared with the pre-crawl cron and
// the admin scraper-health endpoint, so all three always agree). All three
// are refreshed proactively by the pre-crawl cron well before they expire,
// so in steady state a visitor rarely sees anything this stale.

function anonSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function serviceRoleSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isFresh(scrapedAtIso: string, maxAgeMs: number): boolean {
  const t = new Date(scrapedAtIso).getTime();
  return !Number.isNaN(t) && Date.now() - t < maxAgeMs;
}

/** Past TTL but still worth serving instantly while a refresh runs in the background. */
function isWithinStaleGrace(scrapedAtIso: string, ttlMs: number): boolean {
  return isFresh(scrapedAtIso, ttlMs * STALE_GRACE_MULTIPLIER);
}

/**
 * Best-effort background refresh for a stale-but-in-grace row, scheduled via
 * after() so it costs the triggering visitor nothing. Opportunistic: if no
 * concurrency slot is free right now it just skips — the pre-crawl worker
 * or a future visitor's own stale-trigger will get it eventually. Never
 * throws, never blocks anything else.
 */
async function refreshStaleInBackground(toolId: ScraperToolId, input: ParsedToolQuery): Promise<void> {
  const anon = anonSupabaseClient();
  const slot = await acquireScrapeSlot(anon, input.marketplace);
  if (!slot.acquired) return; // busy right now — don't compete with live guest traffic, just skip this cycle

  const session = await createBrowserSession();
  try {
    const page = session?.page;
    if (!page) return;

    switch (toolId) {
      case "visibility": {
        const data = await searchProductRank(
          { marketplace: input.marketplace, keyword: input.keyword, targetTitle: input.targetTitle, maxPages: 3 },
          page,
        );
        await cacheVisibilityResult(input, {
          rank: data.rank,
          page: data.page,
          isIndexed: data.isIndexed,
          isOnFirstPage: data.isOnFirstPage,
          searchResultCount: data.results.length,
        });
        break;
      }
      case "index-check": {
        const data = await checkIndex(
          { marketplace: input.marketplace, keyword: input.keyword, targetTitle: input.targetTitle, maxPages: 3 },
          page,
        );
        await cacheVisibilityResult(input, {
          rank: data.rank,
          page: null,
          isIndexed: data.isIndexed,
          isOnFirstPage: data.isOnFirstPage,
        });
        break;
      }
      case "price-track": {
        const data = await trackCompetitorPrices(
          { marketplace: input.marketplace, keyword: input.keyword, maxResults: 20 },
          page,
        );
        if (!data.error) await cachePriceTrackResult(input, data);
        break;
      }
      case "top100": {
        const data = await analyzeTop100({ marketplace: input.marketplace, keyword: input.keyword, maxItems: 100 }, page);
        if (!data.error) await cacheTop100Result(input, data);
        break;
      }
    }
  } catch {
    // Best-effort — the pre-crawl worker's next run (or the next stale hit) retries anyway.
  } finally {
    await session?.close().catch(() => { /* ignore close errors */ });
    await releaseScrapeSlot(anon, slot.leaseId);
  }
}

/** Best-effort cache write — never blocks or fails the response to the visitor. */
async function cacheVisibilityResult(
  input: ParsedToolQuery,
  fields: {
    rank: number | null | undefined;
    page: number | null | undefined;
    isIndexed: boolean;
    isOnFirstPage: boolean;
    searchResultCount?: number;
  },
): Promise<void> {
  const svc = serviceRoleSupabaseClient();
  if (!svc) return;
  try {
    await upsertSharedVisibilityScan(svc, {
      marketplace: input.marketplace,
      keyword: input.keyword,
      sku: null,
      rank: fields.rank ?? null,
      page: fields.page ?? null,
      isIndexed: fields.isIndexed,
      isOnFirstPage: fields.isOnFirstPage,
      searchResultCount: fields.searchResultCount,
    });
  } catch {
    // Cache write is an optimization, not a correctness requirement — swallow.
  }
}

async function cachePriceTrackResult(input: ParsedToolQuery, result: PriceTrackResult): Promise<void> {
  const svc = serviceRoleSupabaseClient();
  if (!svc) return;
  try {
    await upsertSharedPriceTrackScan(svc, input.marketplace, input.keyword, result);
  } catch {
    // Best-effort — swallow.
  }
}

async function cacheTop100Result(input: ParsedToolQuery, result: Top100AnalysisResult): Promise<void> {
  const svc = serviceRoleSupabaseClient();
  if (!svc) return;
  try {
    await upsertSharedTop100Scan(svc, input.marketplace, input.keyword, result);
  } catch {
    // Best-effort — swallow.
  }
}

export async function runStandaloneTool(
  toolId: ScraperToolId,
  input: ParsedToolQuery,
): Promise<ToolRunEnvelope> {
  const anon = anonSupabaseClient();

  if (toolId === "visibility" || toolId === "index-check") {
    // Demand signal for the pre-crawl worker — record every ask, hit or
    // miss, so popularity is measured by real traffic, not by scrape count.
    // visibility + index-check share ONE bucket: they read/write the same
    // shared_visibility_scans row, so one refresh serves both tools.
    void recordKeywordSearch(serviceRoleSupabaseClient(), "visibility", input.marketplace, input.keyword);

    if (anon) {
      const cached = await loadSharedVisibilityScan(anon, input.marketplace, input.keyword, undefined);
      if (cached) {
        const fresh = isFresh(cached.scrapedAt, VISIBILITY_TTL_MS);
        const staleOk = !fresh && isWithinStaleGrace(cached.scrapedAt, VISIBILITY_TTL_MS);
        if (fresh || staleOk) {
          if (staleOk) after(() => void refreshStaleInBackground(toolId, input));
          const mode = fresh ? "cached" : "stale";
          if (toolId === "visibility") {
            return {
              toolId,
              mode,
              data: {
                found: cached.rank != null,
                rank: cached.rank ?? undefined,
                page: cached.page ?? undefined,
                isIndexed: cached.isIndexed,
                isOnFirstPage: cached.isOnFirstPage,
                searchResultCount: cached.searchResultCount,
                results: [],
                scrapedAt: cached.scrapedAt,
              },
            };
          }
          return {
            toolId,
            mode,
            data: {
              isIndexed: cached.isIndexed,
              isOnFirstPage: cached.isOnFirstPage,
              rank: cached.rank ?? undefined,
              status: !cached.isIndexed ? "not_indexed" : cached.isOnFirstPage ? "first_page" : "deep_page",
              scrapedAt: cached.scrapedAt,
            },
          };
        }
      }
    }
  }

  if (toolId === "price-track") {
    void recordKeywordSearch(serviceRoleSupabaseClient(), "price-track", input.marketplace, input.keyword);
    if (anon) {
      const cached = await loadSharedPriceTrackScan(anon, input.marketplace, input.keyword);
      if (cached) {
        const fresh = isFresh(cached.scrapedAt, PRICE_TRACK_TTL_MS);
        const staleOk = !fresh && isWithinStaleGrace(cached.scrapedAt, PRICE_TRACK_TTL_MS);
        if (fresh || staleOk) {
          if (staleOk) after(() => void refreshStaleInBackground(toolId, input));
          return { toolId, mode: fresh ? "cached" : "stale", data: cached.result };
        }
      }
    }
  }

  if (toolId === "top100") {
    void recordKeywordSearch(serviceRoleSupabaseClient(), "top100", input.marketplace, input.keyword);
    if (anon) {
      const cached = await loadSharedTop100Scan(anon, input.marketplace, input.keyword);
      if (cached) {
        const fresh = isFresh(cached.scrapedAt, TOP100_TTL_MS);
        const staleOk = !fresh && isWithinStaleGrace(cached.scrapedAt, TOP100_TTL_MS);
        if (fresh || staleOk) {
          if (staleOk) after(() => void refreshStaleInBackground(toolId, input));
          return { toolId, mode: fresh ? "cached" : "stale", data: cached.result };
        }
      }
    }
  }

  // Cache missed (or doesn't apply to this tool) — this request wants a real
  // scrape. Gate it behind the cross-instance concurrency lease first.
  const anonForSlot = anon ?? anonSupabaseClient();
  const slot = await acquireScrapeSlot(anonForSlot, input.marketplace);
  if (!slot.acquired) {
    return buildQueuedEnvelope(toolId, 8);
  }

  const session = await createBrowserSession();
  const page = session?.page;

  try {
    if (!page) {
      return {
        toolId,
        mode: "preview",
        data: buildPreviewResult(toolId, input),
      };
    }

    switch (toolId) {
      case "visibility": {
        const data = await searchProductRank(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            maxPages: 3,
          },
          page,
        );
        await cacheVisibilityResult(input, {
          rank: data.rank,
          page: data.page,
          isIndexed: data.isIndexed,
          isOnFirstPage: data.isOnFirstPage,
          searchResultCount: data.results.length,
        });
        return { toolId, mode: "live", data };
      }
      case "index-check": {
        const data = await checkIndex(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            maxPages: 3,
          },
          page,
        );
        await cacheVisibilityResult(input, {
          rank: data.rank,
          page: null,
          isIndexed: data.isIndexed,
          isOnFirstPage: data.isOnFirstPage,
        });
        return { toolId, mode: "live", data };
      }
      case "price-track": {
        const data = await trackCompetitorPrices(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            maxResults: 20,
          },
          page,
        );
        if (!data.error) await cachePriceTrackResult(input, data);
        return { toolId, mode: "live", data };
      }
      case "top100": {
        const data = await analyzeTop100(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            maxItems: 100,
          },
          page,
        );
        if (!data.error) await cacheTop100Result(input, data);
        return { toolId, mode: "live", data };
      }
      default: {
        const _exhaustive: never = toolId;
        return {
          toolId: _exhaustive,
          mode: "preview",
          data: buildPreviewResult(toolId, input),
        };
      }
    }
  } finally {
    await session?.close();
    await releaseScrapeSlot(anonForSlot, slot.leaseId);
  }
}
