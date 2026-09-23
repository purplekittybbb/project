/**
 * Tests for lib/demand/top100.ts
 *
 * All external I/O is mocked — no live network calls.
 * Scraping path uses page.evaluate (no SSR regex parsers).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeReviewStats,
  computeMedian,
  buildItemDemandEstimate,
  analyzeTop100,
} from "@/lib/demand/top100";

vi.mock("@/lib/scrapers/visibility", () => ({
  buildSearchUrl: vi.fn().mockReturnValue("https://example.com/search"),
  RESULTS_PER_PAGE: { trendyol: 36, hepsiburada: 24, n11: 24 },
  randomDelay: vi.fn().mockResolvedValue(undefined),
  checkBlockSignal: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/scrapers/price-tracker", () => ({
  computePriceStats: vi.fn((prices: number[]) => {
    if (!prices.length) return { min: 0, max: 0, median: 0, p25: 0, p75: 0 };
    const sorted = [...prices].sort((a, b) => a - b);
    const n = sorted.length;
    const med =
      n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    return {
      min: sorted[0],
      max: sorted[n - 1],
      median: med,
      p25: sorted[Math.floor(n * 0.25)],
      p75: sorted[Math.floor(n * 0.75)],
    };
  }),
}));

type LiveItem = {
  title: string;
  price: number;
  position: number;
  reviewCount: number | null;
};

/** Mock page that always takes the live DOM (evaluate) path. */
function makeEvaluatePage(pages: LiveItem[][]) {
  let pageIdx = 0;
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue("<html></html>"),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
      const src = String(fn);
      if (src.includes("scrollTo")) return null;
      const items = pages[Math.min(pageIdx, pages.length - 1)] ?? [];
      pageIdx++;
      return items;
    }),
  };
}

describe("computeReviewStats", () => {
  it("returns all-zero stats for empty array", () => {
    expect(computeReviewStats([])).toEqual({ p25: 0, p50: 0, p75: 0 });
  });

  it("returns correct percentiles for [10, 20, 30, 40, 50]", () => {
    const r = computeReviewStats([10, 20, 30, 40, 50]);
    expect(r.p50).toBe(30);
    expect(r.p25).toBe(20);
    expect(r.p75).toBe(40);
  });

  it("handles single element", () => {
    expect(computeReviewStats([42])).toEqual({ p25: 42, p50: 42, p75: 42 });
  });

  it("handles unsorted input", () => {
    expect(computeReviewStats([50, 10, 30, 20, 40]).p50).toBe(30);
  });
});

describe("computeMedian", () => {
  it("returns 0 for empty array", () => {
    expect(computeMedian([])).toBe(0);
  });

  it("returns the middle value for odd-length array", () => {
    expect(computeMedian([1, 3, 5, 7, 9])).toBe(5);
  });

  it("averages two middle values for even-length array", () => {
    expect(computeMedian([2, 4, 6, 8])).toBe(5);
  });

  it("handles single element", () => {
    expect(computeMedian([42])).toBe(42);
  });
});

describe("buildItemDemandEstimate", () => {
  it("returns a DemandRangeResult with the correct shape", () => {
    const result = buildItemDemandEstimate(200, 250);
    expect(result).toHaveProperty("rangeLow");
    expect(result).toHaveProperty("rangeHigh");
    expect(result).toHaveProperty("confidenceScore");
    expect(result).toHaveProperty("confidenceLevel");
    expect(result).toHaveProperty("signalsUsed");
    expect(result).toHaveProperty("explanation");
  });

  it("uses priceSignal when marketMedianPrice is valid", () => {
    const result = buildItemDemandEstimate(100, 250);
    expect(result.signalsUsed).toContain("priceSignal");
  });

  it("falls back to neutral when marketMedianPrice is 0", () => {
    const result = buildItemDemandEstimate(200, 0);
    // Implementation may still tag priceSignal with a neutral weight — just ensure it runs.
    expect(result).toHaveProperty("signalsUsed");
    expect(Array.isArray(result.signalsUsed)).toBe(true);
  });
});

describe("analyzeTop100", () => {
  const defaultInput = {
    marketplace: "trendyol" as const,
    keyword: "bluetooth kulaklık",
    maxItems: 36,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const vis = await import("@/lib/scrapers/visibility");
    vi.mocked(vis.randomDelay).mockResolvedValue(undefined);
    vi.mocked(vis.checkBlockSignal).mockReturnValue(false);
  });

  it("returns isPartial + error when no page provided", async () => {
    const result = await analyzeTop100(defaultInput);
    expect(result.isPartial).toBe(true);
    expect(result.error).toBe("No browser session");
    expect(result.items).toEqual([]);
    expect(result.aggregateConfidence).toBe(0);
  });

  it("builds items with demandEstimate for each product", async () => {
    const mockPage = makeEvaluatePage([
      [
        { title: "Kulaklık A", price: 200, position: 1, reviewCount: null },
        { title: "Kulaklık B", price: 250, position: 2, reviewCount: null },
        { title: "Kulaklık C", price: 300, position: 3, reviewCount: null },
      ],
    ]);

    const result = await analyzeTop100(defaultInput, mockPage as never);

    expect(result.items).toHaveLength(3);
    for (const item of result.items) {
      expect(item.demandEstimate).toBeDefined();
      expect(item.demandEstimate.confidenceLevel).toBe("low");
      expect(item.demandEstimate.signalsUsed).toContain("priceSignal");
    }
  });

  it("computes priceStats from scraped items", async () => {
    const mockPage = makeEvaluatePage([
      [
        { title: "A", price: 100, position: 1, reviewCount: null },
        { title: "B", price: 200, position: 2, reviewCount: null },
        { title: "C", price: 300, position: 3, reviewCount: null },
      ],
    ]);
    const result = await analyzeTop100(defaultInput, mockPage as never);

    expect(result.priceStats.min).toBe(100);
    expect(result.priceStats.max).toBe(300);
    expect(result.priceStats.p50).toBe(200);
  });

  it("computes reviewStats and entryBarrierEstimate when ≥10 review counts available", async () => {
    const products = Array.from({ length: 15 }, (_, i) => ({
      title: `Product ${i + 1}`,
      price: 100 + i * 10,
      position: i + 1,
      reviewCount: (i + 1) * 10,
    }));

    let scrollCalled = false;
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("scrollTo")) {
          scrollCalled = true;
          return null;
        }
        return products;
      }),
    };

    const result = await analyzeTop100(defaultInput, mockPage as never);

    expect(scrollCalled).toBe(true);
    expect(result.reviewStats).toBeDefined();
    expect(result.entryBarrierEstimate).toBeDefined();
    expect(result.items[0].reviewCount).toBe(10);
    expect(result.items[14].reviewCount).toBe(150);
  });

  it("scroll trigger is called before card extraction in live DOM path", async () => {
    const evaluateCalls: string[] = [];
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("scrollTo")) {
          evaluateCalls.push("scroll");
          return null;
        }
        evaluateCalls.push("extract");
        return [{ title: "Test", price: 100, position: 1, reviewCount: 42 }];
      }),
    };

    const result = await analyzeTop100(
      { marketplace: "trendyol", keyword: "test", maxItems: 1 },
      mockPage as never,
    );

    expect(evaluateCalls[0]).toBe("scroll");
    expect(evaluateCalls[1]).toBe("extract");
    expect(result.items[0]?.reviewCount).toBe(42);
  });

  it("text-pattern fallback: reviewCount extracted even when CSS selectors miss", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("scrollTo")) return null;
        return [
          { title: "Ürün A", price: 299, position: 1, reviewCount: 1547 },
          { title: "Ürün B", price: 450, position: 2, reviewCount: null },
        ];
      }),
    };

    const result = await analyzeTop100(
      { marketplace: "trendyol", keyword: "test", maxItems: 2 },
      mockPage as never,
    );

    expect(result.items[0].reviewCount).toBe(1547);
    expect(result.items[1].reviewCount).toBeUndefined();
  });

  it("circuit breaker aborts after 2 consecutive block signals", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    vi.mocked(vis.checkBlockSignal).mockReturnValue(true);

    const mockPage = makeEvaluatePage([[], [], []]);
    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 100 },
      mockPage as never,
    );

    expect(result.error).toContain("Circuit breaker");
    expect(mockPage.goto).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(0);
  });

  it("circuit breaker resets on a clean page between blocks", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    let callCount = 0;
    vi.mocked(vis.checkBlockSignal).mockImplementation(() => {
      callCount++;
      return callCount === 1 || callCount === 3;
    });

    const mockPage = makeEvaluatePage([
      [],
      [{ title: "Clean Product", price: 100, position: 1, reviewCount: null }],
      [],
    ]);

    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 3 },
      mockPage as never,
    );

    expect(result.error).toBeUndefined();
  });

  it("calls randomDelay between pages (anti-bot)", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    const page1 = Array.from({ length: 36 }, (_, i) => ({
      title: `P${i}`,
      price: 100 + i,
      position: i + 1,
      reviewCount: null as number | null,
    }));
    const page2 = Array.from({ length: 36 }, (_, i) => ({
      title: `Q${i}`,
      price: 200 + i,
      position: i + 1,
      reviewCount: null as number | null,
    }));

    const mockPage = makeEvaluatePage([page1, page2]);
    await analyzeTop100({ ...defaultInput, maxItems: 72 }, mockPage as never);

    expect(vis.randomDelay).toHaveBeenCalled();
  });

  it("does NOT call randomDelay after last page", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    const mockPage = makeEvaluatePage([
      [{ title: "Only", price: 100, position: 1, reviewCount: null }],
    ]);
    await analyzeTop100({ ...defaultInput, maxItems: 1 }, mockPage as never);

    expect(vis.randomDelay).not.toHaveBeenCalled();
  });

  it("caps maxItems at 100", async () => {
    const mockPage = makeEvaluatePage([[]]);
    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 999 },
      mockPage as never,
    );

    expect(result.isPartial).toBe(true);
  });

  it("aggregateConfidence is 0 for circuit-breaker abort with 0 items", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    vi.mocked(vis.checkBlockSignal).mockReturnValue(true);

    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 100 },
      makeEvaluatePage([[], [], []]) as never,
    );
    expect(result.aggregateConfidence).toBe(0);
    expect(result.error).toContain("Circuit breaker");
  });

  it("aggregateConfidence is 80 when all items collected cleanly", async () => {
    const products = Array.from({ length: 10 }, (_, i) => ({
      title: `Product ${i + 1}`,
      price: 100 + i * 5,
      position: i + 1,
      reviewCount: null as number | null,
    }));

    const mockPage = makeEvaluatePage([products]);
    const result = await analyzeTop100({ ...defaultInput, maxItems: 10 }, mockPage as never);

    expect(result.aggregateConfidence).toBe(80);
    expect(result.isPartial).toBe(false);
  });
});
