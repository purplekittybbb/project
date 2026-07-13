/**
 * Published fallback benchmarks — the cold-start layer.
 *
 * These are REPRESENTATIVE distributions modeled on publicly reported US /
 * marketplace e-commerce ranges, not live pooled data. They exist so a brand-
 * new deployment (or any segment that hasn't yet crossed the k-anonymity floor)
 * still shows a useful, honestly-labeled benchmark instead of nothing. The read
 * side always prefers real pooled data over these, and every figure sourced
 * from here renders with a "Representative" badge and no sample size — it is
 * never dressed up as a live number.
 *
 * They live at the broadest granularity (all marketplaces × all categories ×
 * all sizes), so they are the LAST resort in the selection ladder. As the user
 * base grows, pooled segments progressively override them with zero code
 * changes.
 *
 * Source note surfaced in the UI: representative ranges consistent with
 * commonly reported marketplace e-commerce benchmarks (return rates,
 * advertising cost of sale, fulfilment/shipping share, marketplace commission
 * bands, and gross-margin/COGS structure). Treated as a modeled prior, refined
 * by real cohort data as it accrues.
 *
 * Fallback usage is logged at call sites via lib/benchmarks/fallback-log.ts
 * (`[benchmark-fallback]` prefix, structured JSON fields).
 */

import { ANY, type BenchmarkRow, type MetricKey } from "./types";

/** p10 / p50 / p90 per metric (raw ascending values, direction applied at read). */
const PUBLISHED_DISTRIBUTIONS: Record<MetricKey, { p10: number; p50: number; p90: number }> = {
  // Higher is better. p10 = weak sellers, p90 = strong sellers.
  true_margin_pct: { p10: 2.0, p50: 12.0, p90: 25.0 },
  // Lower is better for all of these. p10 = best-in-class, p90 = worst.
  return_rate_pct: { p10: 4.0, p50: 8.5, p90: 15.0 },
  acos_pct: { p10: 15.0, p50: 26.0, p90: 38.0 },
  shipping_ratio_pct: { p10: 7.5, p50: 12.0, p90: 18.0 },
  commission_ratio_pct: { p10: 8.0, p50: 13.0, p90: 18.0 },
  cogs_ratio_pct: { p10: 45.0, p50: 58.0, p90: 70.0 },
};

/** Published rows at the broadest (ANY × ANY × ANY) granularity. `sampleSize:0`
 *  is the sentinel the UI reads as "representative, no live sample". */
export function publishedBenchmarks(): BenchmarkRow[] {
  return (Object.keys(PUBLISHED_DISTRIBUTIONS) as MetricKey[]).map((metric) => ({
    marketplace: ANY,
    category: ANY,
    sizeBucket: ANY,
    metric,
    ...PUBLISHED_DISTRIBUTIONS[metric],
    sampleSize: 0,
    source: "published" as const,
  }));
}
