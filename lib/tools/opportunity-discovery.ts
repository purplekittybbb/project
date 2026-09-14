/**
 * Fırsat Keşfi (opportunity discovery) — real per-SKU sales momentum from the
 * seller's OWN transaction history. NOT a market-wide "trending products
 * across all sellers" feature: that would need a historical snapshot table
 * for scraped pazaryeri data (top100/price-track results are only ever
 * stored as the single latest value per keyword — see
 * lib/supabase/shared-scraper-cache.ts's upsert-by-keyword design — so there
 * is currently no real time series to compute a cross-seller trend from).
 * Faking that would violate the project's no-fake-data rule, so this stays
 * scoped to what the data actually supports: has THIS seller's own SKU
 * picked up or lost pace recently.
 *
 * "Son 30 gün" is computed as a rolling window ending at the MOST RECENT
 * sale_date in the row set, not literal wall-clock "today". A seller's last
 * sync might be a few days (or, in a demo/export, months) old — anchoring to
 * "today" would silently show "no data" for a perfectly good dataset. Ending
 * the window at the latest real data point is what analytics tools usually
 * do for exactly this reason, and it never fabricates a data point that
 * isn't there.
 */

import type { StoredRow } from "@/lib/supabase/user-data";

export interface SkuMomentum {
  sku: string;
  productTitle: string;
  category: string;
  recentUnits: number;
  priorUnits: number;
  /** null when priorUnits is 0 (can't express a meaningful %; see isNew) */
  growthPct: number | null;
  /** No sales in the prior window at all — a genuinely new mover, not a % change. */
  isNew: boolean;
  direction: "up" | "down" | "flat";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 30 * DAY_MS;

export function computeSkuMomentum(rows: StoredRow[]): SkuMomentum[] {
  if (rows.length === 0) return [];

  const dated = rows
    .map((r) => ({ row: r, t: Date.parse(r.sale_date) }))
    .filter((r) => Number.isFinite(r.t));
  if (dated.length === 0) return [];

  const latest = Math.max(...dated.map((r) => r.t));
  const recentStart = latest - WINDOW_MS;
  const priorStart = latest - 2 * WINDOW_MS;

  const bySku = new Map<
    string,
    { productTitle: string; category: string; recentUnits: number; priorUnits: number }
  >();

  for (const { row, t } of dated) {
    const entry = bySku.get(row.sku) ?? {
      productTitle: row.product_name?.trim() || row.sku,
      category: row.category ?? "Diğer",
      recentUnits: 0,
      priorUnits: 0,
    };
    if (t > recentStart) {
      entry.recentUnits += row.units;
    } else if (t > priorStart) {
      entry.priorUnits += row.units;
    }
    // Product name can arrive on a later row even if an earlier one lacked it.
    if (row.product_name?.trim()) entry.productTitle = row.product_name.trim();
    bySku.set(row.sku, entry);
  }

  const out: SkuMomentum[] = [];
  for (const [sku, e] of bySku) {
    if (e.recentUnits === 0 && e.priorUnits === 0) continue;
    const isNew = e.priorUnits === 0 && e.recentUnits > 0;
    const growthPct = e.priorUnits > 0 ? ((e.recentUnits - e.priorUnits) / e.priorUnits) * 100 : null;
    const direction: SkuMomentum["direction"] =
      isNew || (growthPct != null && growthPct > 5) ? "up" : growthPct != null && growthPct < -5 ? "down" : "flat";
    out.push({
      sku,
      productTitle: e.productTitle,
      category: e.category,
      recentUnits: e.recentUnits,
      priorUnits: e.priorUnits,
      growthPct,
      isNew,
      direction,
    });
  }

  // Risers (and new movers) first, biggest change first; ties broken by recent volume.
  return out.sort((a, b) => {
    const rank = (m: SkuMomentum) => (m.isNew ? Infinity : m.growthPct ?? -Infinity);
    return rank(b) - rank(a) || b.recentUnits - a.recentUnits;
  });
}
