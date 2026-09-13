/**
 * Shared result cache for price-track and top100 (migration 0031) — the
 * price-track/top100 counterpart to lib/supabase/shared-visibility.ts.
 *
 * The full scrape result (already JSON-serializable) is stored verbatim in
 * a jsonb column and returned as-is on a cache hit, so the result panels
 * (PriceTrackResultPanel / Top100ResultPanel) need no cache-specific code —
 * a cached payload has the exact same shape as a live one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceTrackResult } from "@/lib/scrapers/price-tracker";
import type { Top100AnalysisResult } from "@/lib/demand/top100";

interface CachedRow<T> {
  result: T;
  scrapedAt: string;
}

async function loadCached<T>(
  supabase: SupabaseClient,
  table: string,
  marketplace: string,
  keyword: string,
): Promise<CachedRow<T> | null> {
  const { data, error } = await supabase
    .from(table)
    .select("result, scraped_at")
    .eq("marketplace", marketplace)
    .eq("keyword", keyword)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { result: T; scraped_at: string };
  return { result: row.result, scrapedAt: row.scraped_at };
}

async function upsertCached<T>(
  supabase: SupabaseClient,
  table: string,
  marketplace: string,
  keyword: string,
  result: T,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(table)
    .upsert(
      { marketplace, keyword, result, scraped_at: new Date().toISOString() },
      { onConflict: "marketplace,keyword" },
    );
  return { error: error ? error.message : null };
}

export function loadSharedPriceTrackScan(
  supabase: SupabaseClient,
  marketplace: string,
  keyword: string,
): Promise<CachedRow<PriceTrackResult> | null> {
  return loadCached<PriceTrackResult>(supabase, "shared_price_track_scans", marketplace, keyword);
}

export function upsertSharedPriceTrackScan(
  supabase: SupabaseClient,
  marketplace: string,
  keyword: string,
  result: PriceTrackResult,
): Promise<{ error: string | null }> {
  return upsertCached(supabase, "shared_price_track_scans", marketplace, keyword, result);
}

export function loadSharedTop100Scan(
  supabase: SupabaseClient,
  marketplace: string,
  keyword: string,
): Promise<CachedRow<Top100AnalysisResult> | null> {
  return loadCached<Top100AnalysisResult>(supabase, "shared_top100_scans", marketplace, keyword);
}

export function upsertSharedTop100Scan(
  supabase: SupabaseClient,
  marketplace: string,
  keyword: string,
  result: Top100AnalysisResult,
): Promise<{ error: string | null }> {
  return upsertCached(supabase, "shared_top100_scans", marketplace, keyword, result);
}
