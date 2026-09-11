/**
 * Barcode-based cross-marketplace product matching.
 *
 * PURPOSE: A seller may list the same physical product on multiple marketplaces
 * under different SKUs, titles, or categories. By grouping listings by barcode
 * (EAN/GTIN) the system can:
 *   - Detect price inconsistencies across marketplaces
 *   - Build a CanonicalProduct from the best listing data
 *   - Track relative performance per marketplace for the same product
 *
 * MIGRATION DEPENDENCY: supabase/migrations/0020_user_transactions_barcode.sql
 * adds the `barcode` column to user_transactions. This module becomes functional
 * once:
 *   a. Migration 0020 is applied.
 *   b. The Trendyol and N11 adapters populate the barcode field on sync.
 *   c. The UserRawRow type includes a `barcode?: string` field.
 */

import type { CanonicalProduct } from "../domain/canonical";
import type { UserRawRow } from "../adapters/csv";

export interface BarcodeMatch {
  barcode: string;
  listings: BarcodeListingVariant[];
  /** Derived: longest/most complete title across all listings. */
  canonicalTitle: string;
  /** Price spread: max price − min price across all marketplace listings. */
  priceSpread: number;
  /** The marketplace with the highest trueMarginPct for this product. */
  bestMarketplace?: string;
}

export interface BarcodeListingVariant {
  marketplace: string;
  sku: string;
  title: string;
  currentPrice?: number;
  trueMarginPct?: number;
  isLoser?: boolean;
}

/**
 * Input row for groupByBarcode — represents a single marketplace listing.
 * Migration 0020 adds the barcode column; adapters populate it on sync.
 */
export interface BarcodeRow {
  marketplace: string;
  sku: string;
  title: string;
  barcode: string | null;
  trueMarginPct?: number;
  isLoser?: boolean;
  currentPrice?: number;
}

/**
 * A detected price inconsistency across marketplaces for the same barcode.
 */
export interface PriceInconsistency {
  barcode: string;
  /** max - min price across marketplaces */
  spread: number;
  cheapestMarketplace: string;
  expensiveMarketplace: string;
  /** Turkish: "X pazaryerinde ₺Y daha ucuz satılıyor" */
  suggestion: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Group BarcodeRow[] by barcode, computing:
 *   - canonicalTitle: longest non-null title across all listings
 *   - priceSpread: max - min price where price is available
 *   - bestMarketplace: marketplace with the highest trueMarginPct
 *
 * Rows with null or empty barcode are skipped.
 *
 * @param rows - Array of BarcodeRow from marketplace adapters
 * @returns Map of barcode → BarcodeMatch
 */
export function groupByBarcode(rows: BarcodeRow[]): Map<string, BarcodeMatch> {
  const result = new Map<string, BarcodeMatch>();

  for (const row of rows) {
    // Skip rows with null or empty barcode
    if (!row.barcode || row.barcode.trim() === "") continue;

    const barcode = row.barcode.trim();
    const listing: BarcodeListingVariant = {
      marketplace: row.marketplace,
      sku: row.sku,
      title: row.title,
      currentPrice: row.currentPrice,
      trueMarginPct: row.trueMarginPct,
      isLoser: row.isLoser,
    };

    if (!result.has(barcode)) {
      result.set(barcode, {
        barcode,
        listings: [listing],
        canonicalTitle: row.title ?? "",
        priceSpread: 0,
        bestMarketplace: undefined,
      });
    } else {
      result.get(barcode)!.listings.push(listing);
    }
  }

  // Second pass: compute derived fields for each group
  for (const [, match] of result) {
    const listings = match.listings;

    // canonicalTitle: longest non-null title
    match.canonicalTitle = listings.reduce((best, l) => {
      const title = l.title ?? "";
      return title.length > best.length ? title : best;
    }, "");

    // priceSpread: max - min price (only for listings with a price)
    const prices = listings
      .map((l) => l.currentPrice)
      .filter((p): p is number => p != null && !isNaN(p));

    if (prices.length >= 2) {
      match.priceSpread = Math.max(...prices) - Math.min(...prices);
    } else {
      match.priceSpread = 0;
    }

    // bestMarketplace: highest trueMarginPct
    const withMargin = listings.filter(
      (l) => l.trueMarginPct != null && isFinite(l.trueMarginPct!)
    );
    if (withMargin.length > 0) {
      const best = withMargin.reduce((prev, cur) =>
        (cur.trueMarginPct ?? -Infinity) > (prev.trueMarginPct ?? -Infinity) ? cur : prev
      );
      match.bestMarketplace = best.marketplace;
    }
  }

  return result;
}

/**
 * Detect price inconsistencies across marketplaces for products grouped by barcode.
 *
 * Returns inconsistencies where the price spread exceeds `minSpreadThreshold` (default 20 TL).
 * Each inconsistency includes a Turkish suggestion string.
 *
 * @param matches - Array of BarcodeMatch (from groupByBarcode)
 * @param minSpreadThreshold - Minimum price spread to report (default 20 TL)
 */
export function detectPriceInconsistencies(
  matches: BarcodeMatch[],
  minSpreadThreshold = 20
): PriceInconsistency[] {
  const result: PriceInconsistency[] = [];

  for (const match of matches) {
    if (match.priceSpread < minSpreadThreshold) continue;

    // Collect listings that have a price
    const priced = match.listings.filter(
      (l) => l.currentPrice != null && !isNaN(l.currentPrice!)
    );
    if (priced.length < 2) continue;

    // Find cheapest and most expensive
    const sorted = [...priced].sort((a, b) => (a.currentPrice ?? 0) - (b.currentPrice ?? 0));
    const cheapest = sorted[0];
    const expensive = sorted[sorted.length - 1];

    const spread = (expensive.currentPrice ?? 0) - (cheapest.currentPrice ?? 0);
    if (spread < minSpreadThreshold) continue;

    const suggestion =
      `${cheapest.marketplace} pazaryerinde ₺${spread.toFixed(2)} daha ucuz satılıyor`;

    result.push({
      barcode: match.barcode,
      spread,
      cheapestMarketplace: cheapest.marketplace,
      expensiveMarketplace: expensive.marketplace,
      suggestion,
    });
  }

  return result;
}

// ── CanonicalProduct conversion ───────────────────────────────────────────────

/**
 * Build a CanonicalProduct from a BarcodeMatch and an optional detected
 * price inconsistency.
 *
 * This is the bridge between the raw groupByBarcode output and the
 * canonical domain model (lib/domain/canonical.ts).
 *
 * @param match         - BarcodeMatch from groupByBarcode
 * @param inconsistency - Optional PriceInconsistency from detectPriceInconsistencies
 * @returns             - CanonicalProduct ready for persistence or display
 */
export function toCanonicalProduct(
  match: BarcodeMatch,
  inconsistency?: PriceInconsistency,
): CanonicalProduct {
  return {
    barcode: match.barcode,
    canonicalTitle: match.canonicalTitle,
    marketplaceListings: match.listings.map((l) => ({
      marketplace: l.marketplace,
      sku: l.sku,
      title: l.title,
      currentPrice: l.currentPrice,
      trueMarginPct: l.trueMarginPct,
      isLoser: l.isLoser,
    })),
    priceSpread: match.priceSpread,
    bestMarketplace: match.bestMarketplace,
    ...(inconsistency
      ? {
          priceInconsistency: {
            spread: inconsistency.spread,
            cheapestMarketplace: inconsistency.cheapestMarketplace,
            expensiveMarketplace: inconsistency.expensiveMarketplace,
            suggestion: inconsistency.suggestion,
          },
        }
      : {}),
  };
}

/**
 * Build CanonicalProduct[] for all barcodes in one pass.
 *
 * Runs groupByBarcode + detectPriceInconsistencies internally so callers
 * only need to pass the raw BarcodeRow array.
 *
 * @param rows               - BarcodeRow[] from marketplace adapters / user_transactions
 * @param minSpreadThreshold - Minimum price spread to flag as inconsistency (default 20 TL)
 */
export function buildAllCanonicalProducts(
  rows: BarcodeRow[],
  minSpreadThreshold = 20,
): CanonicalProduct[] {
  const matchMap        = groupByBarcode(rows);
  const matches         = Array.from(matchMap.values());
  const inconsistencies = detectPriceInconsistencies(matches, minSpreadThreshold);
  const incByBarcode    = new Map(inconsistencies.map((inc) => [inc.barcode, inc]));

  return matches.map((match) =>
    toCanonicalProduct(match, incByBarcode.get(match.barcode)),
  );
}

/**
 * Convert persisted UserRawRow[] into BarcodeRow[] for groupByBarcode.
 *
 * currentPrice is derived as unit revenue (gross_revenue / units) when both
 * are present and units > 0. Rows without a barcode are kept (groupByBarcode
 * will skip them) so callers can pass the full transaction set unchanged.
 */
export function rowsToBarcodeRows(rows: UserRawRow[]): BarcodeRow[] {
  return rows.map((r) => ({
    marketplace: r.marketplace,
    sku: r.sku,
    title: r.product_name ?? r.sku,
    barcode: r.barcode?.trim() || null,
    currentPrice:
      r.units > 0 && Number.isFinite(r.gross_revenue)
        ? r.gross_revenue / r.units
        : undefined,
  }));
}
