/**
 * Execute a standalone tool — shared-cache hit, then live scrape when browser
 * available, else preview.
 *
 * CONCURRENCY NOTE: visibility/index-check consult shared_visibility_scans
 * (keyword+marketplace, sku="" sentinel for guest queries) before touching a
 * browser. A fresh cache hit (< SHARED_SCAN_TTL_MS) is served straight from
 * Postgres — any number of concurrent visitors can be served this way with
 * zero scraping load. Only a cache MISS triggers a real scrape, and a
 * successful live scrape is written back so the next visitor asking the same
 * question gets the cached path. This is what keeps "everyone at once"
 * affordable without hammering the marketplace or the scraper host.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeTop100 } from "@/lib/demand/top100";
import { createBrowserSession } from "@/lib/scrapers/browser";
import { trackCompetitorPrices } from "@/lib/scrapers/price-tracker";
import { checkIndex, searchProductRank } from "@/lib/scrapers/visibility";
import { loadSharedVisibilityScan, upsertSharedVisibilityScan } from "@/lib/supabase/shared-visibility";
import { buildPreviewResult } from "./demo-results";
import type { ParsedToolQuery } from "./parse-query";
import type { StandaloneToolId } from "./registry";

type ScraperToolId = Exclude<StandaloneToolId, "profit-calc">;

export interface ToolRunEnvelope {
  toolId: ScraperToolId;
  mode: "live" | "cached" | "preview";
  data: unknown;
}

const SHARED_SCAN_TTL_MS = 6 * 60 * 60 * 1000; // 6h — matches the cron's intended cadence.

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

export async function runStandaloneTool(
  toolId: ScraperToolId,
  input: ParsedToolQuery,
): Promise<ToolRunEnvelope> {
  if (toolId === "visibility" || toolId === "index-check") {
    const anon = anonSupabaseClient();
    if (anon) {
      const cached = await loadSharedVisibilityScan(anon, input.marketplace, input.keyword, undefined);
      if (cached && isFresh(cached.scrapedAt, SHARED_SCAN_TTL_MS)) {
        if (toolId === "visibility") {
          return {
            toolId,
            mode: "cached",
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
          mode: "cached",
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
  }
}
