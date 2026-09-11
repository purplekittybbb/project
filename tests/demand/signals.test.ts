import { describe, expect, it } from "vitest";
import {
  computeStockDeltaSignal,
  computeReviewVelocitySignal,
  computeFavoriteSignal,
  computePriceSignal,
  estimateDemand,
  type StockDeltaSignal,
  type ReviewVelocitySignal,
  type FavoriteSignal,
  type PriceSignal,
  type DemandInput,
} from "../../lib/demand/signals";

// ── computeStockDeltaSignal ───────────────────────────────────────────────────

describe("computeStockDeltaSignal", () => {
  it("computes low range with < 30 days of data (confidence 60)", () => {
    const sig: StockDeltaSignal = { dailySalesRate: 5, dataDays: 14 };
    const result = computeStockDeltaSignal(sig);
    // rangeLow = 5 * 28 * 0.8 = 112
    expect(result.rangeLow).toBeCloseTo(112);
    // rangeHigh = 5 * 31 * 1.3 = 201.5
    expect(result.rangeHigh).toBeCloseTo(201.5);
    expect(result.confidenceScore).toBe(60);
  });

  it("computes with >= 30 days of data (confidence 80)", () => {
    const sig: StockDeltaSignal = { dailySalesRate: 10, dataDays: 30 };
    const result = computeStockDeltaSignal(sig);
    // rangeLow = 10 * 28 * 0.8 = 224
    expect(result.rangeLow).toBeCloseTo(224);
    // rangeHigh = 10 * 31 * 1.3 = 403
    expect(result.rangeHigh).toBeCloseTo(403);
    expect(result.confidenceScore).toBe(80);
  });

  it("handles exactly 30 days as high-confidence threshold", () => {
    const sig: StockDeltaSignal = { dailySalesRate: 2, dataDays: 30 };
    expect(computeStockDeltaSignal(sig).confidenceScore).toBe(80);
  });

  it("handles exactly 29 days as low-confidence threshold", () => {
    const sig: StockDeltaSignal = { dailySalesRate: 2, dataDays: 29 };
    expect(computeStockDeltaSignal(sig).confidenceScore).toBe(60);
  });

  it("handles zero dailySalesRate", () => {
    const sig: StockDeltaSignal = { dailySalesRate: 0, dataDays: 60 };
    const result = computeStockDeltaSignal(sig);
    expect(result.rangeLow).toBe(0);
    expect(result.rangeHigh).toBe(0);
    expect(result.confidenceScore).toBe(80);
  });
});

// ── computeReviewVelocitySignal ───────────────────────────────────────────────

describe("computeReviewVelocitySignal", () => {
  it("high velocity (>1 review/day) → factor 1.2", () => {
    const sig: ReviewVelocitySignal = {
      currentReviewCount: 500,
      previousReviewCount: 400,
      daysBetween: 50, // 100/50 = 2 reviews/day
    };
    const m = computeReviewVelocitySignal(sig);
    expect(m.factor).toBe(1.2);
    expect(m.signalName).toBe("reviewVelocity");
  });

  it("low velocity (<0.1 review/day) → factor 0.9", () => {
    const sig: ReviewVelocitySignal = {
      currentReviewCount: 100,
      previousReviewCount: 99,
      daysBetween: 30, // 1/30 ≈ 0.033 reviews/day
    };
    const m = computeReviewVelocitySignal(sig);
    expect(m.factor).toBe(0.9);
  });

  it("moderate velocity (0.1–1 review/day) → factor 1.0", () => {
    const sig: ReviewVelocitySignal = {
      currentReviewCount: 120,
      previousReviewCount: 100,
      daysBetween: 30, // 20/30 ≈ 0.67 reviews/day
    };
    const m = computeReviewVelocitySignal(sig);
    expect(m.factor).toBe(1.0);
  });

  it("exactly 1 review/day → factor 1.0 (boundary: NOT > 1)", () => {
    const sig: ReviewVelocitySignal = {
      currentReviewCount: 130,
      previousReviewCount: 100,
      daysBetween: 30, // exactly 1.0/day
    };
    const m = computeReviewVelocitySignal(sig);
    expect(m.factor).toBe(1.0);
  });

  it("exactly 0.1 review/day → factor 1.0 (boundary: NOT < 0.1)", () => {
    const sig: ReviewVelocitySignal = {
      currentReviewCount: 103,
      previousReviewCount: 100,
      daysBetween: 30, // 3/30 = 0.1/day exactly
    };
    const m = computeReviewVelocitySignal(sig);
    expect(m.factor).toBe(1.0);
  });

  it("zero daysBetween → factor 0.9 (guard: 0/0 = 0 velocity)", () => {
    const sig: ReviewVelocitySignal = {
      currentReviewCount: 500,
      previousReviewCount: 100,
      daysBetween: 0,
    };
    const m = computeReviewVelocitySignal(sig);
    // reviewsPerDay = 0 (guarded) < 0.1 → factor 0.9
    expect(m.factor).toBe(0.9);
  });
});

// ── computeFavoriteSignal ─────────────────────────────────────────────────────

describe("computeFavoriteSignal", () => {
  it("< 100 favourites → neutral (factor 1.0)", () => {
    expect(computeFavoriteSignal({ favoriteCount: 0 }).factor).toBe(1.0);
    expect(computeFavoriteSignal({ favoriteCount: 50 }).factor).toBe(1.0);
    expect(computeFavoriteSignal({ favoriteCount: 99 }).factor).toBe(1.0);
  });

  it("100–500 favourites → slight boost (factor 1.1)", () => {
    expect(computeFavoriteSignal({ favoriteCount: 100 }).factor).toBe(1.1);
    expect(computeFavoriteSignal({ favoriteCount: 300 }).factor).toBe(1.1);
    expect(computeFavoriteSignal({ favoriteCount: 500 }).factor).toBe(1.1);
  });

  it("> 500 favourites → moderate boost (factor 1.2)", () => {
    expect(computeFavoriteSignal({ favoriteCount: 501 }).factor).toBe(1.2);
    expect(computeFavoriteSignal({ favoriteCount: 10000 }).factor).toBe(1.2);
  });

  it("returns correct signalName", () => {
    expect(computeFavoriteSignal({ favoriteCount: 50 }).signalName).toBe("favoriteSignal");
  });
});

// ── computePriceSignal ────────────────────────────────────────────────────────

describe("computePriceSignal", () => {
  it("price < 0.8 × median → strong demand (factor 1.3)", () => {
    const sig: PriceSignal = { productPrice: 70, marketMedianPrice: 100 };
    expect(computePriceSignal(sig).factor).toBe(1.3);
  });

  it("price exactly 0.8 × median → neutral (boundary: NOT < 0.8)", () => {
    const sig: PriceSignal = { productPrice: 80, marketMedianPrice: 100 };
    expect(computePriceSignal(sig).factor).toBe(1.0);
  });

  it("price exactly 1.2 × median → neutral (boundary: NOT > 1.2)", () => {
    const sig: PriceSignal = { productPrice: 120, marketMedianPrice: 100 };
    expect(computePriceSignal(sig).factor).toBe(1.0);
  });

  it("price > 1.2 × median → demand drag (factor 0.85)", () => {
    const sig: PriceSignal = { productPrice: 130, marketMedianPrice: 100 };
    expect(computePriceSignal(sig).factor).toBe(0.85);
  });

  it("zero median → neutral (guard: division by zero)", () => {
    const sig: PriceSignal = { productPrice: 100, marketMedianPrice: 0 };
    expect(computePriceSignal(sig).factor).toBe(1.0);
  });

  it("returns correct signalName", () => {
    expect(computePriceSignal({ productPrice: 100, marketMedianPrice: 100 }).signalName).toBe("priceSignal");
  });
});

// ── estimateDemand ────────────────────────────────────────────────────────────

describe("estimateDemand", () => {
  it("no input → low confidence [0, 1000] wide range", () => {
    const result = estimateDemand({});
    expect(result.rangeLow).toBe(0);
    expect(result.rangeHigh).toBe(1000);
    expect(result.confidenceScore).toBe(20);
    expect(result.confidenceLevel).toBe("low");
    expect(result.signalsUsed).toEqual([]);
  });

  it("stockDelta only (< 30 days) → confidence 60, medium level", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 5, dataDays: 14 },
    });
    expect(result.confidenceScore).toBe(60);
    expect(result.confidenceLevel).toBe("medium");
    expect(result.signalsUsed).toEqual(["stockDelta"]);
    // rangeLow = round5(5 * 28 * 0.8) = round5(112) = 110
    expect(result.rangeLow).toBe(110);
    // rangeHigh = round5(5 * 31 * 1.3) = round5(201.5) = 200
    expect(result.rangeHigh).toBe(200);
  });

  it("stockDelta (>= 30 days) → confidence 80, high level", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 5, dataDays: 30 },
    });
    expect(result.confidenceScore).toBe(80);
    expect(result.confidenceLevel).toBe("high");
  });

  it("stockDelta + reviewVelocity → confidence +10, signals include both", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 5, dataDays: 14 },
      reviewVelocity: {
        currentReviewCount: 200,
        previousReviewCount: 100,
        daysBetween: 30, // high velocity: 3.33/day → factor 1.2
      },
    });
    expect(result.confidenceScore).toBe(70); // 60 + 10
    expect(result.confidenceLevel).toBe("high");
    expect(result.signalsUsed).toContain("stockDelta");
    expect(result.signalsUsed).toContain("reviewVelocity");
    // Range boosted by 1.2
    const expectedLow = Math.round((5 * 28 * 0.8 * 1.2) / 5) * 5;
    const expectedHigh = Math.round((5 * 31 * 1.3 * 1.2) / 5) * 5;
    expect(result.rangeLow).toBe(expectedLow);
    expect(result.rangeHigh).toBe(expectedHigh);
  });

  it("stockDelta + all three optional signals → confidence capped at 95", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 10, dataDays: 60 },
      reviewVelocity: { currentReviewCount: 200, previousReviewCount: 100, daysBetween: 30 },
      favorite: { favoriteCount: 600 },
      price: { productPrice: 50, marketMedianPrice: 100 },
    });
    // 80 + 30 = 110, capped at 95
    expect(result.confidenceScore).toBe(95);
    expect(result.confidenceLevel).toBe("high");
    expect(result.signalsUsed).toHaveLength(4);
  });

  it("rounds to nearest 5", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 1, dataDays: 14 },
    });
    expect(result.rangeLow % 5).toBe(0);
    expect(result.rangeHigh % 5).toBe(0);
  });

  it("output is non-negative (never negative range)", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 0, dataDays: 14 },
    });
    expect(result.rangeLow).toBeGreaterThanOrEqual(0);
    expect(result.rangeHigh).toBeGreaterThanOrEqual(0);
  });

  it("explanation is a non-empty Turkish string", () => {
    const result = estimateDemand({
      stockDelta: { dailySalesRate: 5, dataDays: 30 },
    });
    expect(result.explanation).toBeTruthy();
    expect(result.explanation.length).toBeGreaterThan(10);
    // Should mention Turkish words
    expect(result.explanation).toMatch(/talep|tahmin|güven/i);
  });

  it("confidence level 'medium' at boundary 45-69", () => {
    // 20 (no stock) + 10*2 = 40 — still low
    const r1 = estimateDemand({
      reviewVelocity: { currentReviewCount: 200, previousReviewCount: 100, daysBetween: 30 },
      favorite: { favoriteCount: 600 },
    });
    expect(r1.confidenceScore).toBe(40);
    expect(r1.confidenceLevel).toBe("low");

    // 20 + 10*3 = 50 — medium
    const r2 = estimateDemand({
      reviewVelocity: { currentReviewCount: 200, previousReviewCount: 100, daysBetween: 30 },
      favorite: { favoriteCount: 600 },
      price: { productPrice: 100, marketMedianPrice: 100 },
    });
    expect(r2.confidenceScore).toBe(50);
    expect(r2.confidenceLevel).toBe("medium");
  });

  it("price drag multiplier reduces range", () => {
    const withDrag = estimateDemand({
      stockDelta: { dailySalesRate: 10, dataDays: 30 },
      price: { productPrice: 150, marketMedianPrice: 100 }, // drag: 0.85
    });
    const withoutDrag = estimateDemand({
      stockDelta: { dailySalesRate: 10, dataDays: 30 },
    });
    expect(withDrag.rangeHigh).toBeLessThan(withoutDrag.rangeHigh);
  });
});
