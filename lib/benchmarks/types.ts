/**
 * Sector benchmarking — shared types.
 *
 * The billion-dollar-company technique this implements is a POOLED-COHORT
 * benchmark with a k-anonymity floor and a hierarchical published fallback:
 *
 *  - Each seller's REAL per-segment metrics (from the same engine that powers
 *    the rest of the dashboard) are pooled across the whole user base.
 *  - Benchmarks are computed as p10/p50/p90 PERCENTILES within a segment
 *    (marketplace × category × revenue-size bucket), so a $50k/mo seller is
 *    compared to peers, not a $5M/mo seller.
 *  - A segment is only ever published as "pooled" (real, live) once at least
 *    K_ANON DISTINCT sellers are in it — below that, no individual seller can
 *    be reverse-engineered, and the read side transparently falls back to a
 *    broader pooled segment or a sourced PUBLISHED benchmark.
 *  - Every figure the user sees carries its sample size (N) and source, so a
 *    representative number is never dressed up as a live one.
 *
 * This is the standard cold-start pattern for a data network effect (Stripe
 * Benchmarks / Ramp / Shopify benchmarks all do a version of it): sourced
 * published figures on day one, self-improving to real pooled cohort stats as
 * volume grows — with zero code changes, because the pooled path activates the
 * moment a segment crosses K_ANON.
 */

/** Metrics benchmarked. All are ratios/percentages, so they are comparable
 *  across sellers and currencies without conversion. */
export const METRIC_KEYS = [
  "true_margin_pct",
  "return_rate_pct",
  "acos_pct",
  "shipping_ratio_pct",
  "commission_ratio_pct",
  "cogs_ratio_pct",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** For each metric, is a LOWER value better? (true margin is the one where
 *  higher is better; every cost/leakage ratio is better when lower). Drives
 *  percentile-rank inversion so "top X%" always means "doing well". */
export const LOWER_IS_BETTER: Record<MetricKey, boolean> = {
  true_margin_pct: false,
  return_rate_pct: true,
  acos_pct: true,
  shipping_ratio_pct: true,
  commission_ratio_pct: true,
  cogs_ratio_pct: true,
};

/** Revenue-size buckets, on monthly revenue normalized to USD. Segmenting by
 *  size is what makes the comparison fair — cost structures differ enormously
 *  between a micro seller and a large one. */
export const SIZE_BUCKETS = ["micro", "small", "mid", "large"] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

/** Wildcard used in a benchmark segment key for a collapsed dimension
 *  (e.g. category="*" = "all categories on this marketplace at this size"). */
export const ANY = "*";

/** Monthly-revenue (USD) thresholds for the size buckets. */
export const SIZE_BUCKET_USD_MAX: Record<Exclude<SizeBucket, "large">, number> = {
  micro: 10_000,
  small: 50_000,
  mid: 250_000,
};

/** Minimum DISTINCT sellers before a pooled segment may be published — the
 *  k-anonymity floor. Below this, the segment stays private and the read side
 *  falls back to a broader segment or a published benchmark.
 *
 *  Configurable via K_ANONYMITY_THRESHOLD env var (default: 5).
 */
export const K_ANON = getKAnonymityThreshold();

function getKAnonymityThreshold(): number {
  const fromEnv = Number(process.env.K_ANONYMITY_THRESHOLD);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return 5;
}

/** One seller's real metrics for one (marketplace, category) slice they sell in. */
export interface MetricSlice {
  marketplace: string;
  category: string;
  sizeBucket: SizeBucket;
  monthlyRevenueUsd: number;
  metrics: Record<MetricKey, number>;
}

/** All of one seller's slices — the unit the aggregator consumes. Grouping by
 *  seller is what lets the aggregator enforce one-vote-per-seller and count
 *  distinct sellers for k-anonymity. */
export interface SellerSlices {
  userId: string;
  slices: MetricSlice[];
}

/** A published benchmark distribution — the aggregated output. `marketplace`,
 *  `category`, and `sizeBucket` are either a concrete value or ANY ("*"). */
export interface BenchmarkRow {
  marketplace: string;
  category: string;
  sizeBucket: SizeBucket | typeof ANY;
  metric: MetricKey;
  p10: number;
  p50: number;
  p90: number;
  sampleSize: number;
  source: "pooled" | "published";
}
