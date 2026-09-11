/**
 * Visibility & demand canonical types — Aşama B (Phase B).
 *
 * These types flow through the visibility scraper, demand engine, and
 * persistence layer. They are canonical — marketplace adapters map to/from
 * these, nothing else. No I/O here.
 */

export type MarketplaceSlug = string; // "trendyol" | "hepsiburada" | "n11" etc.

/**
 * Result of a single product-rank check on a marketplace search results page.
 * Stored append-only in the visibility_checks table.
 */
export interface VisibilityCheck {
  id: string;
  tenantId: string;
  marketplace: MarketplaceSlug;
  sku: string;
  keyword: string;
  rank: number | null;       // null = not found in search results
  page: number | null;
  isIndexed: boolean;
  isOnFirstPage: boolean;
  searchResultCount?: number;
  checkedAt: string;         // ISO timestamp
  /** Set after migration 0027 when this row was dual-written from a shared scan. */
  sharedScanId?: string | null;
}

/**
 * Shared (not user-scoped) scan result for one (marketplace, keyword, sku) key.
 * Written by the cron; readable by anyone. Who is watching lives in VisibilityWatch.
 */
export interface SharedVisibilityScan {
  id: string;
  marketplace: MarketplaceSlug;
  keyword: string;
  /** Empty string means keyword-only (no SKU). */
  sku: string;
  rank: number | null;
  page: number | null;
  isIndexed: boolean;
  isOnFirstPage: boolean;
  searchResultCount?: number;
  scrapedAt: string;
}

/**
 * A user's private watch on a (marketplace, sku, keyword) triple.
 * RLS: auth.uid() = user_id. Never stored on the shared scan row.
 */
export interface VisibilityWatch {
  id: string;
  tenantId: string;
  marketplace: MarketplaceSlug;
  sku: string;
  keyword: string;
  createdAt: string;
}

/**
 * A user's private watch joined to the current shared scan result (if any).
 * This is the phase-3 read model: WHO is private, RESULT is shared.
 */
export interface WatchedVisibility {
  watch: VisibilityWatch;
  scan: SharedVisibilityScan | null;
}

/**
 * Demand estimate snapshot for one (user, marketplace, sku) triplet.
 * Produced by lib/demand/signals.ts; stored append-only in demand_estimates.
 */
export interface DemandEstimate {
  id: string;
  tenantId: string;
  marketplace: MarketplaceSlug;
  sku: string;
  rangeLow: number;           // units/month lower bound
  rangeHigh: number;          // units/month upper bound
  confidenceScore: number;    // 0-100
  confidenceLevel: "high" | "medium" | "low";
  signalsUsed: string[];      // e.g. ["stockDelta", "reviewVelocity"]
  explanation: string;        // Turkish human-readable
  estimatedAt: string;        // ISO timestamp
}

/**
 * Aggregated category-level price/volume data scraped from marketplace
 * search pages. Shared (not user-scoped); written by the scraping cron.
 */
export interface CategoryTrend {
  id: string;
  marketplace: MarketplaceSlug;
  categoryName: string;
  keyword: string;
  medianPrice: number;
  currency: string;
  topRankReviewCount?: number;
  priceP25: number;
  priceP50: number;
  priceP75: number;
  sampleSize: number;
  scrapedAt: string;
}
