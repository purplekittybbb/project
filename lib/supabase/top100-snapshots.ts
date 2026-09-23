/**
 * Top 100 snapshot persistence (migration 0025).
 *
 * Writes Top100AnalysisResult output to Supabase:
 *   - top100_snapshots: one row per analysis run
 *   - top100_items:     one row per ranked product
 *
 * Used by the cron/scraper with a service-role client.
 * All reads use public RLS (no user-scoped data).
 *
 * GRACEFUL DEGRADATION: soft-fails if migration 0025 not yet applied.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Top100AnalysisResult } from "../demand/top100";

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a Top 100 analysis result to Supabase.
 *
 * Writes to top100_snapshots first, then batch-inserts all top100_items.
 * Fails gracefully (logs + returns error string) if the tables don't exist.
 *
 * @param supabase - Service-role client (bypasses RLS for insert).
 * @param result   - Output of analyzeTop100().
 * @returns { snapshotId } on success, { error } on failure.
 */
export async function saveTop100Snapshot(
  supabase: SupabaseClient,
  result: Top100AnalysisResult,
): Promise<{ snapshotId: string | null; error: string | null }> {
  // ── Insert snapshot row ────────────────────────────────────────────────
  const snapshotPayload = {
    marketplace:           result.marketplace,
    keyword:               result.keyword,
    item_count:            result.items.length,
    price_p25:             result.priceStats.p25,
    price_p50:             result.priceStats.p50,
    price_p75:             result.priceStats.p75,
    price_min:             result.priceStats.min,
    price_max:             result.priceStats.max,
    review_p25:            result.reviewStats?.p25 ?? null,
    review_p50:            result.reviewStats?.p50 ?? null,
    review_p75:            result.reviewStats?.p75 ?? null,
    entry_barrier_reviews: result.entryBarrierEstimate ?? null,
    aggregate_confidence:  result.aggregateConfidence,
    is_partial:            result.isPartial,
    scraped_at:            result.analysedAt,
  };

  const { data: snapshotData, error: snapshotError } = await supabase
    .from("top100_snapshots")
    .insert(snapshotPayload)
    .select("id")
    .single();

  if (snapshotError || !snapshotData) {
    const msg = snapshotError?.message ?? "No data returned after insert";
    console.error("[top100-snapshots] Failed to insert snapshot:", msg);
    return { snapshotId: null, error: msg };
  }

  const snapshotId = (snapshotData as { id: string }).id;

  // ── Batch-insert items ────────────────────────────────────────────────
  if ((result.items ?? []).length === 0) {
    return { snapshotId, error: null };
  }

  const itemsPayload = (result.items ?? []).map((item) => ({
    snapshot_id:              snapshotId,
    rank:                     item.rank,
    title:                    item.title,
    price:                    item.price,
    currency:                 item.currency,
    review_count:             item.reviewCount ?? null,
    demand_range_low:         item.demandEstimate.rangeLow,
    demand_range_high:        item.demandEstimate.rangeHigh,
    demand_confidence:        item.demandEstimate.confidenceScore,
    demand_confidence_level:  item.demandEstimate.confidenceLevel,
  }));

  // Batch in chunks of 500 to avoid request size limits
  const CHUNK = 500;
  for (let i = 0; i < itemsPayload.length; i += CHUNK) {
    const chunk = itemsPayload.slice(i, i + CHUNK);
    const { error: itemError } = await supabase
      .from("top100_items")
      .insert(chunk);

    if (itemError) {
      console.error("[top100-snapshots] Failed to insert items chunk at offset %d: %s", i, itemError.message);
      return { snapshotId, error: itemError.message };
    }
  }

  console.log("[top100-snapshots] Saved snapshot %s with %d items. marketplace=%s keyword=%s",
    snapshotId, result.items.length, result.marketplace, result.keyword);

  return { snapshotId, error: null };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export interface StoredTop100Summary {
  id: string;
  marketplace: string;
  keyword: string;
  itemCount: number;
  priceP50: number | null;
  entryBarrierReviews: number | null;
  aggregateConfidence: number;
  isPartial: boolean;
  scrapedAt: string;
}

/**
 * Load the most recent Top 100 snapshots for a marketplace+keyword pair.
 * Uses public RLS — no auth required.
 *
 * @param supabase    - Any Supabase client (public anon or service-role).
 * @param marketplace - e.g. "trendyol"
 * @param keyword     - Search keyword / category name.
 * @param limit       - How many snapshots to return (default 10, history view).
 */
export async function loadTop100Snapshots(
  supabase: SupabaseClient,
  marketplace: string,
  keyword: string,
  limit = 10,
): Promise<StoredTop100Summary[]> {
  const { data, error } = await supabase
    .from("top100_snapshots")
    .select("id, marketplace, keyword, item_count, price_p50, entry_barrier_reviews, aggregate_confidence, is_partial, scraped_at")
    .eq("marketplace", marketplace)
    .eq("keyword", keyword)
    .order("scraped_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error("[top100-snapshots] Failed to load snapshots:", error?.message);
    return [];
  }

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    marketplace: String(r.marketplace),
    keyword: String(r.keyword),
    itemCount: Number(r.item_count),
    priceP50: r.price_p50 != null ? Number(r.price_p50) : null,
    entryBarrierReviews: r.entry_barrier_reviews != null ? Number(r.entry_barrier_reviews) : null,
    aggregateConfidence: Number(r.aggregate_confidence),
    isPartial: Boolean(r.is_partial),
    scrapedAt: String(r.scraped_at),
  }));
}

/**
 * Load the items for a specific snapshot.
 * Items are sorted by rank (ascending).
 */
export async function loadTop100Items(
  supabase: SupabaseClient,
  snapshotId: string,
): Promise<Array<{
  rank: number;
  title: string;
  price: number;
  currency: string;
  reviewCount: number | null;
  demandRangeLow: number;
  demandRangeHigh: number;
  demandConfidence: number;
  demandConfidenceLevel: "high" | "medium" | "low";
}>> {
  const { data, error } = await supabase
    .from("top100_items")
    .select("rank, title, price, currency, review_count, demand_range_low, demand_range_high, demand_confidence, demand_confidence_level")
    .eq("snapshot_id", snapshotId)
    .order("rank", { ascending: true });

  if (error || !data) {
    console.error("[top100-snapshots] Failed to load items for snapshot %s: %s", snapshotId, error?.message);
    return [];
  }

  return (data as Array<Record<string, unknown>>).map((r) => ({
    rank: Number(r.rank),
    title: String(r.title),
    price: Number(r.price),
    currency: String(r.currency),
    reviewCount: r.review_count != null ? Number(r.review_count) : null,
    demandRangeLow: Number(r.demand_range_low),
    demandRangeHigh: Number(r.demand_range_high),
    demandConfidence: Number(r.demand_confidence),
    demandConfidenceLevel: (r.demand_confidence_level as "high" | "medium" | "low") ?? "low",
  }));
}
