/**
 * Read-side selection + ranking.
 *
 * Given a seller's own segment (marketplace, category, size) and the full set
 * of benchmark rows, pick the BEST benchmark for each metric and compute where
 * the seller falls in it.
 *
 * "Best" = live pooled data over a published estimate, and the most specific
 * segment over a broader one. So a seller is compared to "Electronics sellers
 * on Trendyol at your revenue size" if enough of those exist, otherwise to
 * "Electronics sellers on Trendyol", then "sellers on Trendyol", etc., finally
 * to a sourced published figure — always disclosing which, and the N behind it.
 */

import {
  ANY,
  LOWER_IS_BETTER,
  type BenchmarkRow,
  type MetricKey,
  type SizeBucket,
} from "./types";

export type Standing = "good" | "near" | "behind";

export interface RankedMetric {
  metric: MetricKey;
  yours: number;
  p10: number;
  p50: number;
  p90: number;
  sampleSize: number;
  source: "pooled" | "published";
  /** How the segment was matched: which dims were concrete vs collapsed. */
  segment: { marketplace: string; category: string; sizeBucket: string };
  /** 1..99 — percent of peers this seller is doing BETTER than (direction-aware). */
  betterThanPct: number;
  standing: Standing;
}

/** Most-specific → least-specific candidate segments for a target. */
function segmentLadder(
  marketplace: string,
  category: string,
  sizeBucket: SizeBucket
): { marketplace: string; category: string; sizeBucket: string }[] {
  return [
    { marketplace, category, sizeBucket },
    { marketplace, category, sizeBucket: ANY },
    { marketplace, category: ANY, sizeBucket },
    { marketplace, category: ANY, sizeBucket: ANY },
    { marketplace: ANY, category, sizeBucket },
    { marketplace: ANY, category, sizeBucket: ANY },
    { marketplace: ANY, category: ANY, sizeBucket },
    { marketplace: ANY, category: ANY, sizeBucket: ANY },
  ];
}

/**
 * Select the best benchmark row for one metric. Prefers ANY pooled row over
 * any published row (live data wins), and within a source prefers the most
 * specific segment. Returns null if nothing at all matches.
 */
export function selectBenchmark(
  rows: BenchmarkRow[],
  marketplace: string,
  category: string,
  sizeBucket: SizeBucket,
  metric: MetricKey
): BenchmarkRow | null {
  const ladder = segmentLadder(marketplace, category, sizeBucket);
  const matches = (r: BenchmarkRow, seg: { marketplace: string; category: string; sizeBucket: string }) =>
    r.metric === metric &&
    r.marketplace === seg.marketplace &&
    r.category === seg.category &&
    r.sizeBucket === seg.sizeBucket;

  // Pass 1: pooled, most specific first.
  for (const seg of ladder) {
    const hit = rows.find((r) => r.source === "pooled" && matches(r, seg));
    if (hit) return hit;
  }
  // Pass 2: published, most specific first.
  for (const seg of ladder) {
    const hit = rows.find((r) => r.source === "published" && matches(r, seg));
    if (hit) return hit;
  }
  return null;
}

/**
 * Where does `value` fall in this distribution, as "% of peers you're beating"
 * (direction-aware: for a lower-is-better metric, a lower value beats more
 * peers). Piecewise-linear across the three known percentile points, clamped
 * to [1, 99] so we never claim a hard 0/100 from three summary points.
 */
export function betterThanPct(value: number, row: BenchmarkRow, metric: MetricKey): number {
  // Ascending-value percentile: what fraction of peers have a LOWER value.
  let valuePercentile: number;
  if (value <= row.p10) valuePercentile = 10;
  else if (value >= row.p90) valuePercentile = 90;
  else if (value <= row.p50) valuePercentile = lerp(value, row.p10, row.p50, 10, 50);
  else valuePercentile = lerp(value, row.p50, row.p90, 50, 90);

  // valuePercentile = % of peers below this value. If higher is better, that's
  // exactly "% you beat". If lower is better, invert.
  const beats = LOWER_IS_BETTER[metric] ? 100 - valuePercentile : valuePercentile;
  return Math.min(99, Math.max(1, Math.round(beats)));
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return (y0 + y1) / 2;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/** good / near / behind vs the median, direction-aware (>8% relative = clear). */
export function standingVsMedian(value: number, row: BenchmarkRow, metric: MetricKey): Standing {
  const better = LOWER_IS_BETTER[metric] ? value < row.p50 : value > row.p50;
  const nearBand = Math.abs(value - row.p50) / (Math.abs(row.p50) || 1) < 0.08;
  if (nearBand) return "near";
  return better ? "good" : "behind";
}

/** Full ranked result for one metric, or null if no benchmark exists for it. */
export function rankMetric(
  rows: BenchmarkRow[],
  marketplace: string,
  category: string,
  sizeBucket: SizeBucket,
  metric: MetricKey,
  yours: number
): RankedMetric | null {
  const row = selectBenchmark(rows, marketplace, category, sizeBucket, metric);
  if (!row) return null;
  return {
    metric,
    yours,
    p10: row.p10,
    p50: row.p50,
    p90: row.p90,
    sampleSize: row.sampleSize,
    source: row.source,
    segment: { marketplace: row.marketplace, category: row.category, sizeBucket: String(row.sizeBucket) },
    betterThanPct: betterThanPct(yours, row, metric),
    standing: standingVsMedian(yours, row, metric),
  };
}
