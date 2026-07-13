import { describe, it, expect } from "vitest";
import { SELLERS } from "@/lib/engine";
import { extractMetricSlices, sizeBucketForUsd, toUsd } from "@/lib/benchmarks/metrics";
import { aggregatePooled, mergeWithPublished, percentile } from "@/lib/benchmarks/aggregate";
import { publishedBenchmarks } from "@/lib/benchmarks/published";
import { selectBenchmark, betterThanPct, rankMetric } from "@/lib/benchmarks/rank";
import { K_ANON, type MetricKey, type MetricSlice, type SellerSlices } from "@/lib/benchmarks/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function slice(
  marketplace: string,
  category: string,
  sizeBucket: MetricSlice["sizeBucket"],
  trueMargin: number,
  monthlyRevenueUsd = 20_000
): MetricSlice {
  return {
    marketplace,
    category,
    sizeBucket,
    monthlyRevenueUsd,
    metrics: {
      true_margin_pct: trueMargin,
      return_rate_pct: 10,
      acos_pct: 20,
      shipping_ratio_pct: 10,
      commission_ratio_pct: 12,
      cogs_ratio_pct: 55,
    },
  };
}

/** N sellers, each one slice in the same segment, true_margin from `values`. */
function cohort(
  marketplace: string,
  category: string,
  size: MetricSlice["sizeBucket"],
  values: number[],
  idPrefix = "u"
): SellerSlices[] {
  return values.map((v, i) => ({
    userId: `${idPrefix}${i}`,
    slices: [slice(marketplace, category, size, v)],
  }));
}

// ─── percentile ──────────────────────────────────────────────────────────────

describe("percentile (linear interpolation)", () => {
  it("computes median and tails on a known array", () => {
    const s = [10, 12, 14, 16, 18];
    expect(percentile(s, 0.5)).toBe(14);
    expect(percentile(s, 0.1)).toBeCloseTo(10.8, 5);
    expect(percentile(s, 0.9)).toBeCloseTo(17.2, 5);
  });
  it("handles single-element and empty arrays", () => {
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([], 0.5)).toBe(0);
  });
});

// ─── k-anonymity ──────────────────────────────────────────────────────────────

describe("aggregatePooled — k-anonymity", () => {
  it(`emits an exact segment only when ≥ K_ANON (=${K_ANON}) distinct sellers`, () => {
    const enough = cohort("trendyol", "electronics", "small", [10, 12, 14, 16, 18]); // 5
    const tooFew = cohort("trendyol", "toys", "small", [5, 7, 9, 11], "t"); // 4
    const rows = aggregatePooled([...enough, ...tooFew]);

    const exactElectronics = rows.find(
      (r) => r.marketplace === "trendyol" && r.category === "electronics" && r.sizeBucket === "small" && r.metric === "true_margin_pct"
    );
    expect(exactElectronics).toBeDefined();
    expect(exactElectronics!.sampleSize).toBe(5);
    expect(exactElectronics!.source).toBe("pooled");
    expect(exactElectronics!.p50).toBe(14);

    // The 4-seller exact segment must NOT be published.
    const exactToys = rows.find(
      (r) => r.marketplace === "trendyol" && r.category === "toys" && r.sizeBucket === "small" && r.metric === "true_margin_pct"
    );
    expect(exactToys).toBeUndefined();
  });

  it("aggregates a broader segment that crosses K_ANON even when each exact segment is below it", () => {
    // 3 electronics + 3 toys sellers: neither category hits K_ANON=5 alone,
    // but (trendyol, *, small) pools all 6.
    const elec = cohort("trendyol", "electronics", "small", [10, 12, 14], "e");
    const toys = cohort("trendyol", "toys", "small", [16, 18, 20], "t");
    const rows = aggregatePooled([...elec, ...toys]);

    expect(rows.find((r) => r.category === "electronics" && r.sizeBucket === "small")).toBeUndefined();
    const broad = rows.find(
      (r) => r.marketplace === "trendyol" && r.category === "*" && r.sizeBucket === "small" && r.metric === "true_margin_pct"
    );
    expect(broad).toBeDefined();
    expect(broad!.sampleSize).toBe(6);
  });
});

// ─── one vote per seller ──────────────────────────────────────────────────────

describe("aggregatePooled — one vote per seller", () => {
  it("counts a multi-slice seller once and revenue-weights their value", () => {
    // 4 single-slice sellers + 1 seller with TWO slices in the same broad
    // segment (trendyol, *, small). Distinct sellers = 5, not 6.
    const singles = cohort("trendyol", "electronics", "small", [10, 10, 10, 10], "s");
    const multi: SellerSlices = {
      userId: "multi",
      slices: [
        slice("trendyol", "electronics", "small", 20, 10_000),
        slice("trendyol", "toys", "small", 40, 30_000),
      ],
    };
    const rows = aggregatePooled([...singles, multi]);

    const broad = rows.find(
      (r) => r.marketplace === "trendyol" && r.category === "*" && r.sizeBucket === "small" && r.metric === "true_margin_pct"
    );
    expect(broad).toBeDefined();
    expect(broad!.sampleSize).toBe(5); // NOT 6 — multi-slice seller counted once

    // multi's single vote = revenue-weighted mean: (20*10k + 40*30k)/40k = 35.
    // Distribution = [10,10,10,10,35]; p90 interpolates in the top segment.
    expect(broad!.p50).toBe(10);
    expect(broad!.p90).toBeGreaterThan(10);
    expect(broad!.p90).toBeLessThanOrEqual(35);
  });
});

// ─── merge with published ─────────────────────────────────────────────────────

describe("mergeWithPublished", () => {
  it("below K_ANON, no pooled rows exist so published survives untouched (cold start)", () => {
    const tooFew = cohort("trendyol", "electronics", "small", [10, 12, 14, 16]); // 4 < K
    const pooled = aggregatePooled(tooFew);
    expect(pooled.length).toBe(0);
    const merged = mergeWithPublished(pooled, publishedBenchmarks());
    const globalReturn = merged.find(
      (r) => r.marketplace === "*" && r.category === "*" && r.sizeBucket === "*" && r.metric === "return_rate_pct"
    );
    expect(globalReturn).toBeDefined();
    expect(globalReturn!.source).toBe("published");
  });

  it("once ≥ K_ANON sellers exist, the pooled global row overrides the published one (live data wins)", () => {
    const pooled = aggregatePooled(cohort("trendyol", "electronics", "small", [10, 12, 14, 16, 18]));
    const merged = mergeWithPublished(pooled, publishedBenchmarks());
    const globalMargin = merged.find(
      (r) => r.marketplace === "*" && r.category === "*" && r.sizeBucket === "*" && r.metric === "true_margin_pct"
    );
    expect(globalMargin).toBeDefined();
    expect(globalMargin!.source).toBe("pooled"); // overrode the published estimate
    expect(globalMargin!.sampleSize).toBe(5);
  });
});

// ─── selection ladder ─────────────────────────────────────────────────────────

describe("selectBenchmark — ladder + pooled-over-published", () => {
  const pooled = aggregatePooled(cohort("trendyol", "electronics", "small", [10, 12, 14, 16, 18]));
  const rows = mergeWithPublished(pooled, publishedBenchmarks());

  it("prefers the exact pooled segment when present", () => {
    const hit = selectBenchmark(rows, "trendyol", "electronics", "small", "true_margin_pct");
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("pooled");
    expect(hit!.category).toBe("electronics");
  });

  it("falls back to published global in cold start (no pooled rows at all)", () => {
    // A sub-K cohort produces zero pooled rows, so selection lands on published.
    const coldRows = mergeWithPublished(
      aggregatePooled(cohort("trendyol", "toys", "small", [5, 7, 9, 11])), // 4 < K → []
      publishedBenchmarks()
    );
    const hit = selectBenchmark(coldRows, "amazon_us", "furniture", "large", "return_rate_pct");
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("published");
    expect(hit!.marketplace).toBe("*");
  });

  it("once pooled data exists, a live global row is preferred over the published estimate even for an unseen segment", () => {
    const hit = selectBenchmark(rows, "amazon_us", "furniture", "large", "return_rate_pct");
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("pooled"); // real data (N disclosed) beats a guess
  });

  it("prefers a broad pooled row over an exact published one (live data wins)", () => {
    // No exact pooled for (trendyol, electronics, mid), but broad pooled exists
    // at (trendyol, electronics, *) — should beat the published global.
    const hit = selectBenchmark(rows, "trendyol", "electronics", "mid", "true_margin_pct");
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("pooled");
  });
});

// ─── direction-aware ranking ──────────────────────────────────────────────────

describe("betterThanPct — direction awareness", () => {
  const higherBetter = { marketplace: "*", category: "*", sizeBucket: "*" as const, metric: "true_margin_pct" as MetricKey, p10: 5, p50: 12, p90: 25, sampleSize: 40, source: "pooled" as const };
  const lowerBetter = { marketplace: "*", category: "*", sizeBucket: "*" as const, metric: "return_rate_pct" as MetricKey, p10: 4, p50: 8.5, p90: 15, sampleSize: 40, source: "pooled" as const };

  it("high true-margin beats most peers", () => {
    expect(betterThanPct(25, higherBetter, "true_margin_pct")).toBeGreaterThanOrEqual(89);
    expect(betterThanPct(5, higherBetter, "true_margin_pct")).toBeLessThanOrEqual(11);
  });

  it("low return-rate beats most peers (inverted)", () => {
    expect(betterThanPct(4, lowerBetter, "return_rate_pct")).toBeGreaterThanOrEqual(89);
    expect(betterThanPct(15, lowerBetter, "return_rate_pct")).toBeLessThanOrEqual(11);
  });

  it("median value ranks near 50 either direction", () => {
    expect(betterThanPct(12, higherBetter, "true_margin_pct")).toBe(50);
    expect(betterThanPct(8.5, lowerBetter, "return_rate_pct")).toBe(50);
  });
});

// ─── engine integration: real slices from a seed seller ───────────────────────

describe("extractMetricSlices — real engine numbers", () => {
  it("produces one slice per (marketplace, category) with sane metrics", () => {
    const slices = extractMetricSlices(SELLERS[0]);
    expect(slices.length).toBeGreaterThan(0);
    for (const s of slices) {
      expect(s.marketplace).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(["micro", "small", "mid", "large"]).toContain(s.sizeBucket);
      // ratios are finite numbers
      expect(Number.isFinite(s.metrics.true_margin_pct)).toBe(true);
      expect(s.metrics.acos_pct).toBeGreaterThanOrEqual(0);
      expect(s.metrics.cogs_ratio_pct).toBeGreaterThanOrEqual(0);
    }
  });

  it("bucketing + USD normalization", () => {
    expect(toUsd(33_000, "TRY")).toBeCloseTo(1000, 5);
    expect(toUsd(1000, "USD")).toBe(1000);
    expect(sizeBucketForUsd(5_000)).toBe("micro");
    expect(sizeBucketForUsd(30_000)).toBe("small");
    expect(sizeBucketForUsd(100_000)).toBe("mid");
    expect(sizeBucketForUsd(500_000)).toBe("large");
  });
});

// ─── full read-path integration ───────────────────────────────────────────────

describe("rankMetric — end to end", () => {
  it("returns a ranked result with disclosed source + sample size", () => {
    const pooled = aggregatePooled(cohort("trendyol", "electronics", "small", [10, 12, 14, 16, 18]));
    const rows = mergeWithPublished(pooled, publishedBenchmarks());
    const ranked = rankMetric(rows, "trendyol", "electronics", "small", "true_margin_pct", 18);
    expect(ranked).not.toBeNull();
    expect(ranked!.source).toBe("pooled");
    expect(ranked!.sampleSize).toBe(5);
    expect(ranked!.betterThanPct).toBeGreaterThanOrEqual(89);
    expect(ranked!.standing).toBe("good");
  });
});
