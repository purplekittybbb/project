/**
 * Build barcode cross-marketplace analysis from store transaction rows.
 */

import type { UserRawRow } from "@/lib/adapters/csv";
import type { SkuMargin } from "@/lib/domain/margin-engine";
import type { CanonicalProduct } from "@/lib/domain/canonical";
import {
  buildAllCanonicalProducts,
  rowsToBarcodeRows,
  type BarcodeRow,
} from "@/lib/quality/barcode";

export interface BarcodeAnalysisStats {
  totalRows: number;
  rowsWithBarcode: number;
  uniqueBarcodes: number;
  multiMarketplaceBarcodes: number;
}

export interface BarcodeAnalysisResult {
  products: CanonicalProduct[];
  stats: BarcodeAnalysisStats;
}

/** Keep one listing per marketplace+sku (latest non-zero price wins). */
export function dedupeBarcodeRows(rows: BarcodeRow[]): BarcodeRow[] {
  const byKey = new Map<string, BarcodeRow>();
  for (const row of rows) {
    const key = `${row.marketplace}:${row.sku}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const nextPrice = row.currentPrice ?? 0;
    const prevPrice = existing.currentPrice ?? 0;
    if (nextPrice >= prevPrice) byKey.set(key, row);
  }
  return [...byKey.values()];
}

export function enrichBarcodeRows(
  rows: UserRawRow[],
  skuMargins: SkuMargin[],
): BarcodeRow[] {
  const marginBySku = new Map(skuMargins.map((s) => [s.sku, s]));
  return rowsToBarcodeRows(rows).map((r) => {
    const m = marginBySku.get(r.sku);
    return {
      ...r,
      trueMarginPct: m?.trueMarginPct,
      isLoser: (m?.trueMarginPct ?? 0) < 0,
    };
  });
}

export function buildBarcodeAnalysis(
  rows: UserRawRow[],
  skuMargins: SkuMargin[],
): BarcodeAnalysisResult {
  const enriched = dedupeBarcodeRows(enrichBarcodeRows(rows, skuMargins));
  const withBarcode = enriched.filter((r) => r.barcode && r.barcode.trim() !== "");
  const products = buildAllCanonicalProducts(withBarcode);

  const barcodeMarketplaces = new Map<string, Set<string>>();
  for (const r of withBarcode) {
    const set = barcodeMarketplaces.get(r.barcode!) ?? new Set<string>();
    set.add(r.marketplace);
    barcodeMarketplaces.set(r.barcode!, set);
  }

  return {
    products: products.sort((a, b) => b.priceSpread - a.priceSpread),
    stats: {
      totalRows: rows.length,
      rowsWithBarcode: rows.filter((r) => r.barcode?.trim()).length,
      uniqueBarcodes: products.length,
      multiMarketplaceBarcodes: [...barcodeMarketplaces.values()].filter((s) => s.size > 1).length,
    },
  };
}
