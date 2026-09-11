/**
 * Per-SKU unit economics from stored user rows — for safe-price tool pages.
 */

import type { StoredRow } from "@/lib/supabase/user-data";

export interface SkuEconomics {
  sku: string;
  marketplace: string;
  category: string;
  productTitle: string;
  avgSalePrice: number;
  unitCost: number;
  shippingPerUnit: number;
  packagingPerUnit: number;
  adSpendPerUnit: number;
  returnRate: number;
  totalUnits: number;
}

export function buildSkuEconomicsMap(rows: StoredRow[]): Map<string, SkuEconomics> {
  const bySku = new Map<string, StoredRow[]>();
  for (const r of rows) {
    const arr = bySku.get(r.sku) ?? [];
    arr.push(r);
    bySku.set(r.sku, arr);
  }

  const out = new Map<string, SkuEconomics>();
  for (const [sku, group] of bySku) {
    const totalUnits = group.reduce((s, r) => s + r.units, 0) || 1;
    const gross = group.reduce((s, r) => s + r.gross_revenue, 0);
    const latest = group[group.length - 1]!;
    const title =
      group.map((r) => r.product_name?.trim()).find((t) => t && t.length > 0) ?? sku;

    out.set(sku, {
      sku,
      marketplace: latest.marketplace ?? "trendyol",
      category: latest.category ?? "Diğer",
      productTitle: title,
      avgSalePrice: gross / totalUnits,
      unitCost: group.reduce((s, r) => s + r.unit_cost * r.units, 0) / totalUnits,
      shippingPerUnit: group.reduce((s, r) => s + r.shipping, 0) / group.length,
      packagingPerUnit: group.reduce((s, r) => s + (r.packaging ?? 0), 0) / group.length,
      adSpendPerUnit: group.reduce((s, r) => s + r.ad_spend, 0) / group.length,
      returnRate: group.reduce((s, r) => s + r.return_rate, 0) / group.length,
      totalUnits,
    });
  }
  return out;
}

export function productTitleForSku(rows: StoredRow[], sku: string): string {
  const match = rows.find((r) => r.sku === sku && r.product_name?.trim());
  return match?.product_name?.trim() || sku;
}
