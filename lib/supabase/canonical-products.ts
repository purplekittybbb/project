/**
 * Persistence helpers for canonical_products (migration 0026).
 *
 * Converts CanonicalProduct domain objects to/from the database row shape.
 *
 * Usage:
 *   const { error } = await upsertCanonicalProducts(supabase, userId, products);
 *   const products  = await loadCanonicalProducts(supabase, userId);
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalProduct } from "../domain/canonical";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoredCanonicalProduct {
  id: string;
  userId: string;
  barcode: string;
  canonicalTitle: string;
  marketplaceCount: number;
  priceSpread: number;
  bestMarketplace: string | null;
  hasPriceInconsistency: boolean;
  inconsistencySpread: number | null;
  cheapestMarketplace: string | null;
  expensiveMarketplace: string | null;
  inconsistencySuggestion: string | null;
  computedAt: string;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upsert CanonicalProduct[] for a given user.
 *
 * Uses ON CONFLICT (user_id, barcode) DO UPDATE so repeated calls are
 * idempotent — safe to call after every marketplace sync.
 *
 * @returns error string if the upsert failed, null on success.
 */
export async function upsertCanonicalProducts(
  supabase: SupabaseClient,
  userId: string,
  products: CanonicalProduct[],
): Promise<{ error: string | null }> {
  if (products.length === 0) return { error: null };

  const rows = products.map((p) => ({
    user_id:                 userId,
    barcode:                 p.barcode,
    canonical_title:         p.canonicalTitle,
    marketplace_count:       p.marketplaceListings.length,
    price_spread:            p.priceSpread,
    best_marketplace:        p.bestMarketplace ?? null,
    has_price_inconsistency: p.priceInconsistency != null,
    inconsistency_spread:    p.priceInconsistency?.spread ?? null,
    cheapest_marketplace:    p.priceInconsistency?.cheapestMarketplace ?? null,
    expensive_marketplace:   p.priceInconsistency?.expensiveMarketplace ?? null,
    inconsistency_suggestion: p.priceInconsistency?.suggestion ?? null,
    computed_at:             new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("canonical_products")
    .upsert(rows, { onConflict: "user_id,barcode" });

  return { error: error ? error.message : null };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Load all canonical products for a user, ordered by price_spread descending
 * (most inconsistent products first).
 *
 * @returns Array of StoredCanonicalProduct, or empty array on error.
 */
export async function loadCanonicalProducts(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredCanonicalProduct[]> {
  const { data, error } = await supabase
    .from("canonical_products")
    .select("*")
    .eq("user_id", userId)
    .order("price_spread", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id:                      row.id as string,
    userId:                  row.user_id as string,
    barcode:                 row.barcode as string,
    canonicalTitle:          row.canonical_title as string,
    marketplaceCount:        row.marketplace_count as number,
    priceSpread:             Number(row.price_spread),
    bestMarketplace:         (row.best_marketplace as string | null) ?? null,
    hasPriceInconsistency:   row.has_price_inconsistency as boolean,
    inconsistencySpread:     row.inconsistency_spread != null ? Number(row.inconsistency_spread) : null,
    cheapestMarketplace:     (row.cheapest_marketplace as string | null) ?? null,
    expensiveMarketplace:    (row.expensive_marketplace as string | null) ?? null,
    inconsistencySuggestion: (row.inconsistency_suggestion as string | null) ?? null,
    computedAt:              row.computed_at as string,
  }));
}

/**
 * Load only products with detected price inconsistencies (fast path for
 * the "arbitrage opportunities" dashboard widget).
 */
export async function loadPriceInconsistencies(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredCanonicalProduct[]> {
  const { data, error } = await supabase
    .from("canonical_products")
    .select("*")
    .eq("user_id", userId)
    .eq("has_price_inconsistency", true)
    .order("inconsistency_spread", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id:                      row.id as string,
    userId:                  row.user_id as string,
    barcode:                 row.barcode as string,
    canonicalTitle:          row.canonical_title as string,
    marketplaceCount:        row.marketplace_count as number,
    priceSpread:             Number(row.price_spread),
    bestMarketplace:         (row.best_marketplace as string | null) ?? null,
    hasPriceInconsistency:   true,
    inconsistencySpread:     row.inconsistency_spread != null ? Number(row.inconsistency_spread) : null,
    cheapestMarketplace:     (row.cheapest_marketplace as string | null) ?? null,
    expensiveMarketplace:    (row.expensive_marketplace as string | null) ?? null,
    inconsistencySuggestion: (row.inconsistency_suggestion as string | null) ?? null,
    computedAt:              row.computed_at as string,
  }));
}
