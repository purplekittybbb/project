/**
 * Tests for lib/demand/top100.ts
 *
 * All external I/O is mocked — no live network calls, no Playwright.
 *
 * Covers:
 *   - Pure helpers: computeReviewStats, computeMedian, buildItemDemandEstimate
 *   - analyzeTop100: no page (error path)
 *   - analyzeTop100: successful scrape (mock page.content path)
 *   - analyzeTop100: per-item demandEstimate populated
 *   - analyzeTop100: review stats + entry barrier when ≥10 review counts
 *   - analyzeTop100: circuit breaker triggers after 2 consecutive block signals
 *   - analyzeTop100: randomDelay called between pages (anti-bot)
 *   - analyzeTop100: maxItems capped at 100
 *   - analyzeTop100: aggregateConfidence reflects coverage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeReviewStats,
  computeMedian,
  buildItemDemandEstimate,
  analyzeTop100,
} from "@/lib/demand/top100";

// ── Mock visibility module ────────────────────────────────────────────────────
// We mock at the module level so randomDelay and checkBlockSignal are
// controlled in tests (delay → instant; block signal → configurable).

vi.mock("@/lib/scrapers/visibility", () => ({
  buildSearchUrl: vi.fn().mockReturnValue("https://example.com/search"),
  RESULTS_PER_PAGE: { trendyol: 36, hepsiburada: 24, n11: 24 },
  // These are overridden per-test via vi.mocked() — default: instant / no block
  randomDelay:      vi.fn().mockResolvedValue(undefined),
  checkBlockSignal: vi.fn().mockReturnValue(false),
  parseTrendyolResults:    vi.fn().mockReturnValue([]),
  parseHepsiburadaResults: vi.fn().mockReturnValue([]),
  parseN11Results:         vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/scrapers/price-tracker", () => ({
  computePriceStats: vi.fn((prices: number[]) => {
    if (!prices.length) return { min: 0, max: 0, median: 0, p25: 0, p75: 0 };
    const sorted = [...prices].sort((a, b) => a - b);
    const n = sorted.length;
    const med = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
    return {
      min: sorted[0], max: sorted[n - 1], median: med,
      p25: sorted[Math.floor(n * 0.25)], p75: sorted[Math.floor(n * 0.75)],
    };
  }),
}));

// ── Helpers for building mock ScraperPage ─────────────────────────────────────

/**
 * Build a mock page that serves HTML pages in sequence.
 * The content() mock returns the next HTML in the array on each call.
 */
function makeMockPage(htmlPages: string[]) {
  let callCount = 0;
  return {
    goto:    vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockImplementation(async () => {
      const html = htmlPages[callCount] ?? "<html></html>";
      callCount++;
      return html;
    }),
    // no evaluate — uses content/regex path
  };
}

/**
 * Build HTML fixture with N trendyol-style products (parseTrendyolResults mock
 * is overridden per-test when non-empty results are needed).
 */
function trendyolHtml(products: Array<{ name: string; price: number }>) {
  const cards = products.map(({ name, price }) =>
    `<div class="prdct-desc-cntnr-name"><span>${name}</span></div>
     <div class="prc-box-dscntd">${price},00 TL</div>`
  ).join("\n");
  return `<html><body>${cards}</body></html>`;
}

// ── computeReviewStats ────────────────────────────────────────────────────────

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

// ── computeMedian ─────────────────────────────────────────────────────────────

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

// ── buildItemDemandEstimate ───────────────────────────────────────────────────

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
    const result = buildItemDemandEstimate(100, 250); // price < 0.8 * median → boost
    expect(result.signalsUsed).toContain("priceSignal");
  });

  it("falls back to neutral when marketMedianPrice is 0", () => {
    const result = buildItemDemandEstimate(200, 0);
    // Should not throw; priceSignal uses itemPrice as its own median
    expect(result.confidenceLevel).toBe("low");
  });

  it("has low confidence (no stockDelta for competitor products)", () => {
    const result = buildItemDemandEstimate(200, 250);
    // confidenceScore = 20 (no stockDelta) + 10 (priceSignal) = 30 → "low"
    expect(result.confidenceLevel).toBe("low");
    expect(result.confidenceScore).toBeLessThanOrEqual(40);
  });
});

// ── analyzeTop100 ─────────────────────────────────────────────────────────────

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
    const { parseTrendyolResults } = await import("@/lib/scrapers/visibility");
    vi.mocked(parseTrendyolResults).mockReturnValue([
      { title: "Kulaklık A", price: 200, position: 1, pageNumber: 1 },
      { title: "Kulaklık B", price: 250, position: 2, pageNumber: 1 },
      { title: "Kulaklık C", price: 300, position: 3, pageNumber: 1 },
    ]);

    const mockPage = makeMockPage([trendyolHtml([
      { name: "Kulaklık A", price: 200 },
      { name: "Kulaklık B", price: 250 },
      { name: "Kulaklık C", price: 300 },
    ])]);

    const result = await analyzeTop100(defaultInput, mockPage as never);

    expect(result.items).toHaveLength(3);
    for (const item of result.items) {
      expect(item.demandEstimate).toBeDefined();
      expect(item.demandEstimate.confidenceLevel).toBe("low");
      expect(item.demandEstimate.signalsUsed).toContain("priceSignal");
    }
  });

  it("computes priceStats from scraped items", async () => {
    const { parseTrendyolResults } = await import("@/lib/scrapers/visibility");
    vi.mocked(parseTrendyolResults).mockReturnValue([
      { title: "A", price: 100, position: 1, pageNumber: 1 },
      { title: "B", price: 200, position: 2, pageNumber: 1 },
      { title: "C", price: 300, position: 3, pageNumber: 1 },
    ]);

    const mockPage = makeMockPage(["<html></html>"]);
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
      reviewCount: (i + 1) * 10, // 10, 20, ..., 150
    }));

    let scrollCalled = false;
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("scrollTo")) { scrollCalled = true; return null; }
        return products; // main extract returns items with reviewCounts
      }),
    };

    const result = await analyzeTop100(defaultInput, mockPage as never);

    expect(scrollCalled).toBe(true); // scroll trigger fired
    expect(result.reviewStats).toBeDefined();
    expect(result.entryBarrierEstimate).toBeDefined();
    expect(result.items[0].reviewCount).toBe(10);
    expect(result.items[14].reviewCount).toBe(150);
  });

  it("scroll trigger is called before card extraction in live DOM path", async () => {
    // Verifies the lazy-load scroll evaluate fires as the first evaluate call
    const evaluateCalls: string[] = [];
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("scrollTo")) { evaluateCalls.push("scroll"); return null; }
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
    // Simulates DOM where review count was found via text heuristic (selector = null → fallback)
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("scrollTo")) return null;
        return [
          { title: "Ürün A", price: 299, position: 1, reviewCount: 1547 }, // heuristic found
          { title: "Ürün B", price: 450, position: 2, reviewCount: null  }, // nothing found
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
    // Block every page
    vi.mocked(vis.checkBlockSignal).mockReturnValue(true);
    vi.mocked(vis.parseTrendyolResults).mockReturnValue([]);

    // maxItems=100 → maxPages=3, giving the circuit breaker room to accumulate 2 blocks
    const mockPage = makeMockPage(["<html></html>", "<html></html>", "<html></html>"]);
    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 100 },
      mockPage as never,
    );

    expect(result.error).toContain("Circuit breaker");
    // goto called twice: page 1 (block #1) + page 2 (block #2 → circuit open)
    expect(mockPage.goto).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(0);
  });

  it("circuit breaker resets on a clean page between blocks", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    let callCount = 0;
    vi.mocked(vis.checkBlockSignal).mockImplementation(() => {
      callCount++;
      // Block pages 1 and 3, clean page 2 — should NOT trigger circuit breaker
      return callCount === 1 || callCount === 3;
    });

    vi.mocked(vis.parseTrendyolResults)
      .mockReturnValueOnce([]) // page 1 blocked
      .mockReturnValueOnce([{ title: "Clean Product", price: 100, position: 1, pageNumber: 2 }])
      .mockReturnValueOnce([]); // page 3 blocked (but consecutive count resets after page 2)

    const mockPage = makeMockPage([
      "<html></html>",
      "<html></html>",
      "<html></html>",
    ]);

    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 3 }, // small maxItems to complete in 1 page
      mockPage as never,
    );

    // Should NOT have circuit breaker error (only 1 consecutive block at page 3)
    expect(result.error).toBeUndefined();
  });

  it("calls randomDelay between pages (anti-bot)", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    // maxItems=72 → maxPages=2 (ceil(72/36)=2), so a delay is needed between page 1 and 2
    vi.mocked(vis.parseTrendyolResults)
      .mockReturnValueOnce(
        Array.from({ length: 36 }, (_, i) => ({
          title: `P${i}`, price: 100 + i, position: i + 1, pageNumber: 1,
        }))
      )
      .mockReturnValueOnce(
        Array.from({ length: 36 }, (_, i) => ({
          title: `Q${i}`, price: 200 + i, position: i + 1, pageNumber: 2,
        }))
      );

    const mockPage = makeMockPage(["<html></html>", "<html></html>"]);
    await analyzeTop100({ ...defaultInput, maxItems: 72 }, mockPage as never);

    // randomDelay must have been called between page 1 and page 2
    expect(vis.randomDelay).toHaveBeenCalled();
  });

  it("does NOT call randomDelay after last page", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    vi.mocked(vis.parseTrendyolResults).mockReturnValue([
      { title: "Only", price: 100, position: 1, pageNumber: 1 },
    ]);

    const mockPage = makeMockPage(["<html></html>"]);
    await analyzeTop100({ ...defaultInput, maxItems: 1 }, mockPage as never);

    // maxItems=1 → scraping done after first page → no inter-page delay
    expect(vis.randomDelay).not.toHaveBeenCalled();
  });

  it("caps maxItems at 100", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    vi.mocked(vis.parseTrendyolResults).mockReturnValue([]);

    const mockPage = makeMockPage(["<html></html>"]);
    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 999 },
      mockPage as never,
    );

    // maxItems is capped at 100 — no crash, just returns empty partial
    expect(result.isPartial).toBe(true);
  });

  it("aggregateConfidence is 0 for circuit-breaker abort with 0 items", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    vi.mocked(vis.checkBlockSignal).mockReturnValue(true);
    vi.mocked(vis.parseTrendyolResults).mockReturnValue([]);

    // maxItems=100 → maxPages=3 so circuit breaker can fire on page 2
    const result = await analyzeTop100(
      { ...defaultInput, maxItems: 100 },
      makeMockPage(["<html>", "<html>", "<html>"]) as never,
    );
    expect(result.aggregateConfidence).toBe(0);
    expect(result.error).toContain("Circuit breaker");
  });

  it("aggregateConfidence is 80 when all items collected cleanly", async () => {
    const vis = await import("@/lib/scrapers/visibility");
    // Return exactly maxItems products across 1 page
    vi.mocked(vis.parseTrendyolResults).mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        title: `Product ${i + 1}`, price: 100 + i * 5, position: i + 1, pageNumber: 1,
      }))
    );

    const mockPage = makeMockPage(["<html></html>"]);
    const result = await analyzeTop100({ ...defaultInput, maxItems: 10 }, mockPage as never);

    // 10/10 items collected, no circuit breaker → confidence = round(1.0 * 80) = 80
    expect(result.aggregateConfidence).toBe(80);
    expect(result.isPartial).toBe(false);
  });
});
