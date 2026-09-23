/**
 * Execute a standalone tool — shared-cache hit, else enqueue scrape (BullMQ)
 * or fall back to a live sync scrape when Redis is unavailable.
 *
 * When REDIS_URL is set, Vercel API handlers never open a browser: they
 * enqueue via lib/queue.ts and return mode:"queued". The worker scrapes with
 * exponential backoff (2s → 4s → 8s). Without Redis, Postgres scrape_leases
 * still gate a synchronous scrape (local/dev fallback).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { analyzeTop100, type Top100AnalysisResult } from "@/lib/demand/top100";
import { enqueueScrapeJob, isRedisConfigured } from "@/lib/queue";
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
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  loadSharedPriceTrackScan,
  loadSharedTop100Scan,
  upsertSharedPriceTrackScan,
  upsertSharedTop100Scan,
} from "@/lib/supabase/shared-scraper-cache";
import { hasUsablePrices, shouldCachePriceTrackResult } from "@/lib/scrapers/price-tracker";
import { loadSharedVisibilityScan, upsertSharedVisibilityScan } from "@/lib/supabase/shared-visibility";
import { buildPreviewResult } from "./demo-results";
import type { ParsedToolQuery } from "./parse-query";
import type { StandaloneToolId } from "./registry";

type ScraperToolId = Exclude<StandaloneToolId, "profit-calc">;

/** Redis yokken Vercel/sync fallback — kısa tut; 60s spinner yok. */
const INLINE_SCRAPE_TIMEOUT_MS = 20_000;
const INLINE_MAX_PAGES = 2;
const INLINE_PRICE_MAX_RESULTS = 24;
const INLINE_TOP100_MAX_ITEMS = 48;
const INLINE_SCRAPE_FAIL_MESSAGE =
  "Şu an tarayamadık. Birazdan tekrar deneyin.";

export interface ToolRunEnvelope {
  toolId: ScraperToolId;
  mode: "live" | "cached" | "stale" | "queued" | "preview";
  data: unknown;
}

function buildQueuedEnvelope(
  toolId: ScraperToolId,
  retryAfterSeconds: number,
  jobId?: string,
): ToolRunEnvelope {
  return {
    toolId,
    mode: "queued",
    data: {
      message: jobId
        ? "Sonucun hazırlanıyor… Pazaryeri taranıyor; birkaç saniye içinde güncellenecek."
        : "İstek kuyruğa alındı. Sonuç birkaç saniye içinde hazır olacak — otomatik tekrar deneyin.",
      retryAfterSeconds,
      ...(jobId ? { jobId } : {}),
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function inlineFailEnvelope(
  toolId: ScraperToolId,
  input?: ParsedToolQuery,
): ToolRunEnvelope {
  return {
    toolId,
    mode: "live",
    data: {
      error: INLINE_SCRAPE_FAIL_MESSAGE,
      ...(input
        ? {
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            marketplace: input.marketplace,
          }
        : {}),
    },
  };
}

function anonSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function serviceRoleSupabaseClient(): SupabaseClient | null {
  return createServiceRoleClient();
}

function isFresh(scrapedAtIso: string, maxAgeMs: number): boolean {
  const t = new Date(scrapedAtIso).getTime();
  return !Number.isNaN(t) && Date.now() - t < maxAgeMs;
}

function isWithinStaleGrace(scrapedAtIso: string, ttlMs: number): boolean {
  return isFresh(scrapedAtIso, ttlMs * STALE_GRACE_MULTIPLIER);
}

async function refreshStaleInBackground(toolId: ScraperToolId, input: ParsedToolQuery): Promise<void> {
  if (isRedisConfigured()) {
    await enqueueScrapeJob({
      toolId,
      marketplace: input.marketplace,
      keyword: input.keyword,
      targetTitle: input.targetTitle,
      reason: "cache_miss",
    });
    return;
  }

  const anon = anonSupabaseClient();
  const slot = await acquireScrapeSlot(anon, input.marketplace);
  if (!slot.acquired) return;

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
        if (!data.error) {
          await cacheVisibilityResult(input, {
            rank: data.rank,
            page: data.page,
            isIndexed: data.isIndexed,
            isOnFirstPage: data.isOnFirstPage,
            searchResultCount: data.results.length,
          });
        }
        break;
      }
      case "index-check": {
        const data = await checkIndex(
          { marketplace: input.marketplace, keyword: input.keyword, targetTitle: input.targetTitle, maxPages: 3 },
          page,
        );
        if (!data.error) {
          await cacheVisibilityResult(input, {
            rank: data.rank,
            page: null,
            isIndexed: data.isIndexed,
            isOnFirstPage: data.isOnFirstPage,
          });
        }
        break;
      }
      case "price-track": {
        const data = await trackCompetitorPrices(
          { marketplace: input.marketplace, keyword: input.keyword, maxResults: 20 },
          page,
        );
        if (hasUsablePrices(data)) await cachePriceTrackResult(input, data);
        break;
      }
      case "top100": {
        const data = await analyzeTop100(
          { marketplace: input.marketplace, keyword: input.keyword, maxItems: 100 },
          page,
        );
        if (!data.error && data.items.some((item) => item.price > 0)) await cacheTop100Result(input, data);
        break;
      }
    }
  } catch {
    // Best-effort
  } finally {
    await session?.close().catch(() => {
      /* ignore */
    });
    await releaseScrapeSlot(anon, slot.leaseId);
  }
}

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
    // swallow
  }
}

async function cachePriceTrackResult(input: ParsedToolQuery, result: PriceTrackResult): Promise<void> {
  if (!shouldCachePriceTrackResult(result)) return;
  const svc = serviceRoleSupabaseClient();
  if (!svc) return;
  try {
    await upsertSharedPriceTrackScan(svc, input.marketplace, input.keyword, result);
  } catch {
    // swallow
  }
}

async function cacheTop100Result(input: ParsedToolQuery, result: Top100AnalysisResult): Promise<void> {
  const svc = serviceRoleSupabaseClient();
  if (!svc) return;
  try {
    await upsertSharedTop100Scan(svc, input.marketplace, input.keyword, result);
  } catch {
    // swallow
  }
}

async function tryEnqueueScrape(
  toolId: ScraperToolId,
  input: ParsedToolQuery,
  quotaSubject?: { type: "ip" | "user"; key: string },
): Promise<ToolRunEnvelope | null> {
  if (!isRedisConfigured()) return null;

  const enqueued = await enqueueScrapeJob({
    toolId,
    marketplace: input.marketplace,
    keyword: input.keyword,
    targetTitle: input.targetTitle,
    reason: "cache_miss",
    ...(quotaSubject
      ? { quotaSubjectType: quotaSubject.type, quotaSubjectKey: quotaSubject.key }
      : {}),
  });

  if (!enqueued.queued) return null;
  return buildQueuedEnvelope(toolId, 3, enqueued.jobId);
}

export async function runStandaloneTool(
  toolId: ScraperToolId,
  input: ParsedToolQuery,
  opts?: { quotaSubject?: { type: "ip" | "user"; key: string } },
): Promise<ToolRunEnvelope> {
  const anon = anonSupabaseClient();

  if (toolId === "visibility" || toolId === "index-check") {
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
                keyword: input.keyword,
                targetTitle: input.targetTitle,
                marketplace: input.marketplace,
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
              keyword: input.keyword,
              targetTitle: input.targetTitle,
              marketplace: input.marketplace,
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
      if (cached && hasUsablePrices(cached.result)) {
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
      const cachedItems = cached?.result?.items ?? [];
      if (cached && cachedItems.some((item) => item.price > 0)) {
        const fresh = isFresh(cached.scrapedAt, TOP100_TTL_MS);
        const staleOk = !fresh && isWithinStaleGrace(cached.scrapedAt, TOP100_TTL_MS);
        if (fresh || staleOk) {
          if (staleOk) after(() => void refreshStaleInBackground(toolId, input));
          return { toolId, mode: fresh ? "cached" : "stale", data: cached.result };
        }
      }
    }
  }

  // Cache miss — enqueue (preferred); never scrape inside the Vercel handler when Redis is up.
  const queued = await tryEnqueueScrape(toolId, input, opts?.quotaSubject);
  if (queued) return queued;

  // Redis unavailable — short sync scrape behind Postgres lease (≤~20s).
  const anonForSlot = anon ?? anonSupabaseClient();
  const slot = await acquireScrapeSlot(anonForSlot, input.marketplace);
  if (!slot.acquired) {
    return {
      toolId,
      mode: "queued",
      data: {
        message: "Tüm tarama slotları dolu — birkaç saniye sonra otomatik tekrar denenecek.",
        retryAfterSeconds: 8,
      },
    };
  }

  const session = await createBrowserSession();
  const page = session?.page;

  try {
    if (!page) {
      return inlineFailEnvelope(toolId, input);
    }

    const live = await withTimeout(
      runInlineScrape(toolId, input, page),
      INLINE_SCRAPE_TIMEOUT_MS,
      toolId,
    );
    return live;
  } catch {
    return inlineFailEnvelope(toolId, input);
  } finally {
    await session?.close().catch(() => {
      /* ignore */
    });
    await releaseScrapeSlot(anonForSlot, slot.leaseId);
  }
}

async function runInlineScrape(
  toolId: ScraperToolId,
  input: ParsedToolQuery,
  page: NonNullable<Awaited<ReturnType<typeof createBrowserSession>>>["page"],
): Promise<ToolRunEnvelope> {
  switch (toolId) {
    case "visibility": {
      const data = await searchProductRank(
        {
          marketplace: input.marketplace,
          keyword: input.keyword,
          targetTitle: input.targetTitle,
          maxPages: INLINE_MAX_PAGES,
        },
        page,
      );
      if (data.error) {
        return {
          toolId,
          mode: "live",
          data: {
            error: INLINE_SCRAPE_FAIL_MESSAGE,
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            marketplace: input.marketplace,
          },
        };
      }
      await cacheVisibilityResult(input, {
        rank: data.rank,
        page: data.page,
        isIndexed: data.isIndexed,
        isOnFirstPage: data.isOnFirstPage,
        searchResultCount: data.results.length,
      });
      return {
        toolId,
        mode: "live",
        data: {
          ...data,
          scrapedAt: new Date().toISOString(),
          keyword: input.keyword,
          targetTitle: input.targetTitle,
          marketplace: input.marketplace,
        },
      };
    }
    case "index-check": {
      const data = await checkIndex(
        {
          marketplace: input.marketplace,
          keyword: input.keyword,
          targetTitle: input.targetTitle,
          maxPages: INLINE_MAX_PAGES,
        },
        page,
      );
      if (data.error) {
        return {
          toolId,
          mode: "live",
          data: {
            error: INLINE_SCRAPE_FAIL_MESSAGE,
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            marketplace: input.marketplace,
          },
        };
      }
      await cacheVisibilityResult(input, {
        rank: data.rank,
        page: null,
        isIndexed: data.isIndexed,
        isOnFirstPage: data.isOnFirstPage,
      });
      return {
        toolId,
        mode: "live",
        data: {
          ...data,
          scrapedAt: new Date().toISOString(),
          keyword: input.keyword,
          targetTitle: input.targetTitle,
          marketplace: input.marketplace,
        },
      };
    }
    case "price-track": {
      const data = await trackCompetitorPrices(
        {
          marketplace: input.marketplace,
          keyword: input.keyword,
          maxResults: INLINE_PRICE_MAX_RESULTS,
        },
        page,
      );
      if (!hasUsablePrices(data)) {
        return {
          toolId,
          mode: "live",
          data: { ...data, error: data.error || INLINE_SCRAPE_FAIL_MESSAGE },
        };
      }
      await cachePriceTrackResult(input, data);
      return { toolId, mode: "live", data };
    }
    case "top100": {
      const data = await analyzeTop100(
        {
          marketplace: input.marketplace,
          keyword: input.keyword,
          maxItems: INLINE_TOP100_MAX_ITEMS,
        },
        page,
      );
      if (data.error || !data.items.some((item) => item.price > 0)) {
        return {
          toolId,
          mode: "live",
          data: { ...data, error: data.error || INLINE_SCRAPE_FAIL_MESSAGE },
        };
      }
      await cacheTop100Result(input, data);
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
}
