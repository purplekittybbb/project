/**
 * Keyword search popularity (migration 0030) — the input side of the
 * background pre-crawl worker (app/api/cron/precrawl-visibility).
 *
 * Every guest tool query (cache hit or miss) records one search, bucketed by
 * tool_id: "visibility" (shared by the visibility AND index-check tools,
 * since they read/write the same shared_visibility_scans cache row),
 * "price-track", "top100". The pre-crawl cron reads this per bucket to
 * decide which keywords are worth refreshing proactively, so popular
 * searches are usually warm before anyone asks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PrecrawlToolId = "visibility" | "price-track" | "top100";

/** Fire-and-forget — a missed count must never affect the visitor's response. */
export async function recordKeywordSearch(
  supabase: SupabaseClient | null,
  toolId: PrecrawlToolId,
  marketplace: string,
  keyword: string,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("record_keyword_search", {
      p_tool_id: toolId,
      p_marketplace: marketplace,
      p_keyword: keyword,
    });
  } catch {
    // Migration not applied yet, or transient error — stats are an optimization.
  }
}

export interface PrecrawlCandidate {
  marketplace: string;
  keyword: string;
  searchCount: number;
}

/**
 * Most-searched keywords (for one tool bucket) whose cached result is
 * missing or older than `staleAfterMs`. Ordered by popularity so the worker
 * always refreshes the highest-value keywords first when it can only
 * afford a small batch.
 *
 * `freshTable`/`freshFilter` let the caller point this at whichever shared
 * cache table backs that tool (shared_visibility_scans uses sku=""; the
 * price-track/top100 tables have no such column).
 */
export async function loadPrecrawlCandidates(
  supabase: SupabaseClient,
  opts: {
    toolId: PrecrawlToolId;
    freshTable: string;
    freshFilter?: Record<string, string>;
    staleAfterMs: number;
    poolSize: number;
    limit: number;
  },
): Promise<PrecrawlCandidate[]> {
  const { data: popular, error: popularError } = await supabase
    .from("keyword_search_stats")
    .select("marketplace, keyword, search_count")
    .eq("tool_id", opts.toolId)
    .order("search_count", { ascending: false })
    .order("last_searched_at", { ascending: false })
    .limit(opts.poolSize);

  if (popularError || !popular || popular.length === 0) return [];

  const rows = popular as Array<{ marketplace: string; keyword: string; search_count: number }>;
  const staleCutoff = new Date(Date.now() - opts.staleAfterMs).toISOString();

  let freshQuery = supabase
    .from(opts.freshTable)
    .select("marketplace, keyword")
    .gte("scraped_at", staleCutoff)
    .in("marketplace", [...new Set(rows.map((r) => r.marketplace))]);

  for (const [column, value] of Object.entries(opts.freshFilter ?? {})) {
    freshQuery = freshQuery.eq(column, value);
  }

  const { data: freshScans, error: scanError } = await freshQuery;

  const freshKeys = new Set(
    scanError || !freshScans
      ? []
      : (freshScans as Array<{ marketplace: string; keyword: string }>).map(
          (s) => `${s.marketplace}\0${s.keyword}`,
        ),
  );

  const stale = rows.filter((r) => !freshKeys.has(`${r.marketplace}\0${r.keyword}`));

  return stale.slice(0, opts.limit).map((r) => ({
    marketplace: r.marketplace,
    keyword: r.keyword,
    searchCount: r.search_count,
  }));
}
