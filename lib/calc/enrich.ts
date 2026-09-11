/**
 * Post-API cost enrichment.
 *
 * A live marketplace sync (Trendyol/Hepsiburada/N11/Shopify API clients) can
 * only ever know order-side figures — it returns COGS, shipping, return rate,
 * ad spend and packaging as 0, because no marketplace API knows the seller's
 * own costs. This module fills exactly those gaps from a per-SKU cost profile
 * the seller maintains, WITHOUT ever overwriting a value that was already
 * provided (a CSV/manual entry always wins over a stored default).
 *
 * Pure & deterministic — the DB side (loading/saving the per-SKU profile) lives
 * in lib/supabase/product-costs.ts; this file only does the merge, so it is
 * fully unit-testable.
 */

import type { UserRawRow } from "../adapters/csv";

/**
 * Per-unit cost profile for one SKU. Every field is optional: only the ones the
 * seller has actually entered are applied. Per-unit fields are multiplied by a
 * row's `units`; `returnRate` is a rate applied as-is.
 */
export interface ProductCost {
  /** COGS per unit. */
  unitCost?: number;
  /** Seller-borne shipping per unit. */
  shippingPerUnit?: number;
  /** Return rate for this SKU, 0..1. */
  returnRate?: number;
  /** Advertising spend per unit. */
  adSpendPerUnit?: number;
  /** Packaging cost per unit. */
  packagingPerUnit?: number;
}

/** True when a numeric field is missing or left at 0 (i.e. a fillable gap). */
function isGap(value: number | undefined): boolean {
  return value == null || value === 0;
}

/**
 * Fill the zero/absent cost fields of one row from its cost profile. Non-zero
 * values on the row are preserved. Returns a NEW row (never mutates input).
 */
export function enrichRowWithProductCost(row: UserRawRow, cost: ProductCost | undefined): UserRawRow {
  if (!cost) return { ...row };
  const units = row.units > 0 ? row.units : 1;
  const enriched: UserRawRow = { ...row };

  if (isGap(enriched.unit_cost) && cost.unitCost != null) {
    enriched.unit_cost = cost.unitCost;
  }
  if (isGap(enriched.shipping) && cost.shippingPerUnit != null) {
    enriched.shipping = cost.shippingPerUnit * units;
  }
  if (isGap(enriched.return_rate) && cost.returnRate != null) {
    enriched.return_rate = cost.returnRate;
  }
  if (isGap(enriched.ad_spend) && cost.adSpendPerUnit != null) {
    enriched.ad_spend = cost.adSpendPerUnit * units;
  }
  if (isGap(enriched.packaging) && cost.packagingPerUnit != null) {
    enriched.packaging = cost.packagingPerUnit * units;
  }

  return enriched;
}

/**
 * Enrich a batch of rows, looking each row's profile up by SKU. Rows whose SKU
 * has no stored profile pass through unchanged.
 */
export function enrichRowsWithProductCosts(
  rows: UserRawRow[],
  costs: Map<string, ProductCost>,
): UserRawRow[] {
  return rows.map((row) => enrichRowWithProductCost(row, costs.get(row.sku)));
}
