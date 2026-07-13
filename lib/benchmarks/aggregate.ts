/**
 * The pooled-cohort aggregation — the core of the benchmark technique.
 *
 * Given every seller's real metric slices, it emits p10/p50/p90 distributions
 * per segment, enforcing two invariants that make it safe and fair:
 *
 *  1. ONE VOTE PER SELLER. Within any segment a seller contributes a single
 *     value per metric (revenue-weighted across their matching slices), so a
 *     multi-category or multi-marketplace seller can never dominate a broad
 *     segment by being counted many times.
 *  2. K-ANONYMITY. A segment is only emitted once at least K_ANON DISTINCT
 *     sellers are in it — below that, an individual seller's numbers could be
 *     inferred, so the segment stays unpublished and the read side falls back.
 *
 * Segments are emitted at every granularity (marketplace × category × size,
 * collapsing any subset to ANY), so the read side can always pick the most
 * specific segment that has enough sellers.
 */

import {
  ANY,
  K_ANON,
  METRIC_KEYS,
  type BenchmarkRow,
  type MetricKey,
  type SellerSlices,
  type SizeBucket,
} from "./types";

/** percentile_cont-style linear interpolation. `sorted` ascending, p in [0,1]. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The 8 granularity combos: each of (marketplace, category, size) is either
 *  concrete (true) or collapsed to ANY (false). */
const GRANULARITIES: { mp: boolean; cat: boolean; size: boolean }[] = [
  { mp: true, cat: true, size: true },
  { mp: true, cat: true, size: false },
  { mp: true, cat: false, size: true },
  { mp: true, cat: false, size: false },
  { mp: false, cat: true, size: true },
  { mp: false, cat: true, size: false },
  { mp: false, cat: false, size: true },
  { mp: false, cat: false, size: false },
];

interface PerUserAccum {
  weight: number;
  sums: Record<MetricKey, number>;
}

function emptySums(): Record<MetricKey, number> {
  return {
    true_margin_pct: 0,
    return_rate_pct: 0,
    acos_pct: 0,
    shipping_ratio_pct: 0,
    commission_ratio_pct: 0,
    cogs_ratio_pct: 0,
  };
}

/**
 * Aggregate all sellers' slices into pooled benchmark rows. Only segments with
 * ≥ K_ANON distinct sellers are returned.
 */
export function aggregatePooled(sellers: SellerSlices[]): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];

  for (const g of GRANULARITIES) {
    // segmentKey → (userId → weighted metric accumulation)
    const bySegment = new Map<string, Map<string, PerUserAccum>>();

    for (const seller of sellers) {
      for (const slice of seller.slices) {
        const mp = g.mp ? slice.marketplace : ANY;
        const cat = g.cat ? slice.category : ANY;
        const size = g.size ? slice.sizeBucket : ANY;
        const segKey = `${mp} ${cat} ${size}`;

        let users = bySegment.get(segKey);
        if (!users) {
          users = new Map();
          bySegment.set(segKey, users);
        }
        let accum = users.get(seller.userId);
        if (!accum) {
          accum = { weight: 0, sums: emptySums() };
          users.set(seller.userId, accum);
        }
        // Revenue-weight so a seller's larger slices count more, but the seller
        // still contributes exactly one final value per metric.
        const w = Math.max(slice.monthlyRevenueUsd, 1);
        accum.weight += w;
        for (const m of METRIC_KEYS) accum.sums[m] += slice.metrics[m] * w;
      }
    }

    for (const [segKey, users] of bySegment) {
      if (users.size < K_ANON) continue;
      const [mp, cat, size] = segKey.split(" ");

      for (const m of METRIC_KEYS) {
        const values: number[] = [];
        for (const accum of users.values()) {
          if (accum.weight > 0) values.push(accum.sums[m] / accum.weight);
        }
        if (values.length < K_ANON) continue;
        values.sort((a, b) => a - b);
        rows.push({
          marketplace: mp,
          category: cat,
          sizeBucket: size as SizeBucket | typeof ANY,
          metric: m,
          p10: round2(percentile(values, 0.1)),
          p50: round2(percentile(values, 0.5)),
          p90: round2(percentile(values, 0.9)),
          sampleSize: values.length,
          source: "pooled",
        });
      }
    }
  }

  return rows;
}

function rowKey(r: BenchmarkRow): string {
  return `${r.marketplace} ${r.category} ${r.sizeBucket} ${r.metric}`;
}

/**
 * Merge pooled rows with published fallback rows. Pooled always wins on an
 * exact key collision (live data beats a representative estimate); published
 * rows only fill segment/metric keys the pool doesn't cover yet.
 */
export function mergeWithPublished(
  pooled: BenchmarkRow[],
  published: BenchmarkRow[]
): BenchmarkRow[] {
  const byKey = new Map<string, BenchmarkRow>();
  for (const r of published) byKey.set(rowKey(r), r);
  for (const r of pooled) byKey.set(rowKey(r), r); // pooled overwrites published
  return [...byKey.values()];
}
