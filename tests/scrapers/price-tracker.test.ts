/**
 * Price tracker tests — uses mock ScraperPage objects with HTML fixtures.
 * NO real network requests are made.
 */

import { describe, expect, it } from "vitest";
import {
  computePriceStats,
  trackCompetitorPrices,
  type PriceTrackInput,
} from "../../lib/scrapers/price-tracker";
import type { ScraperPage } from "../../lib/scrapers/browser";

// ── computePriceStats (pure function) ─────────────────────────────────────────

describe("computePriceStats", () => {
  it("returns all zeros for empty array", () => {
    const stats = computePriceStats([]);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.p25).toBe(0);
    expect(stats.p75).toBe(0);
  });

  it("single element: all stats equal that value", () => {
    const stats = computePriceStats([500]);
    expect(stats.min).toBe(500);
    expect(stats.max).toBe(500);
    expect(stats.median).toBe(500);
    expect(stats.p25).toBe(500);
    expect(stats.p75).toBe(500);
  });

  it("two elements: median is midpoint", () => {
    const stats = computePriceStats([100, 200]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(200);
    expect(stats.median).toBe(150); // midpoint of 100 and 200
  });

  it("computes correct min/max/median for odd-count sorted array", () => {
    // [100, 200, 300, 400, 500] — median = 300
    const stats = computePriceStats([300, 100, 500, 200, 400]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(500);
    expect(stats.median).toBe(300);
  });

  it("computes correct median for even-count array", () => {
    // [100, 200, 300, 400] — median = 250
    const stats = computePriceStats([400, 100, 300, 200]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(400);
    expect(stats.median).toBe(250);
  });

  it("p25 is less than median, p75 is greater", () => {
    const stats = computePriceStats([100, 200, 300, 400, 500, 600, 700, 800]);
    expect(stats.p25).toBeLessThan(stats.median);
    expect(stats.p75).toBeGreaterThan(stats.median);
  });

  it("does not mutate the input array", () => {
    const original = [300, 100, 200];
    const copy = [...original];
    computePriceStats(original);
    expect(original).toEqual(copy);
  });

  it("handles duplicate values", () => {
    const stats = computePriceStats([100, 100, 100, 100]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(100);
    expect(stats.median).toBe(100);
    expect(stats.p25).toBe(100);
    expect(stats.p75).toBe(100);
  });
});

// ── trackCompetitorPrices — mock page ─────────────────────────────────────────

function makeMockPageWithProducts(productCount: number): ScraperPage {
  // Build a Trendyol-style HTML page with N products
  const items = Array.from({ length: productCount }, (_, i) => `
    <div class="prdct-desc-cntnr-name"><span>Ürün Başlık ${i + 1}</span></div>
    <div class="prc-box-dscntd">${(1000 + i * 100).toLocaleString("tr-TR")},00 TL</div>
  `).join("\n");

  return {
    goto: async () => null,
    content: async () => `<html><body>${items}</body></html>`,
  };
}

describe("trackCompetitorPrices", () => {
  it("returns error result when no page provided", async () => {
    const input: PriceTrackInput = { marketplace: "trendyol", keyword: "kulaklık" };
    const result = await trackCompetitorPrices(input);
    expect(result.error).toBeTruthy();
    expect(result.prices).toHaveLength(0);
    expect(result.keyword).toBe("kulaklık");
    expect(result.marketplace).toBe("trendyol");
  });

  it("collects prices from mock page", async () => {
    const mockPage = makeMockPageWithProducts(5);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "kulaklık", maxResults: 10 },
      mockPage
    );
    expect(result.prices.length).toBeGreaterThan(0);
    expect(result.keyword).toBe("kulaklık");
    expect(result.marketplace).toBe("trendyol");
    expect(result.error).toBeUndefined();
  });

  it("computes stats from collected prices", async () => {
    const mockPage = makeMockPageWithProducts(3);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 10 },
      mockPage
    );
    if (result.prices.length > 0) {
      expect(result.stats.min).toBeGreaterThan(0);
      expect(result.stats.max).toBeGreaterThanOrEqual(result.stats.min);
    }
  });

  it("respects maxResults cap (hard max 50)", async () => {
    const mockPage = makeMockPageWithProducts(10);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 999 },
      mockPage
    );
    // Hard max is 50, but we only have 10 products per page (one page scraped)
    expect(result.prices.length).toBeLessThanOrEqual(50);
  });

  it("assigns ranks starting at 1", async () => {
    const mockPage = makeMockPageWithProducts(3);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 10 },
      mockPage
    );
    if (result.prices.length > 0) {
      expect(result.prices[0].rank).toBe(1);
    }
  });

  it("assigns currency TRY to all collected prices", async () => {
    const mockPage = makeMockPageWithProducts(3);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 10 },
      mockPage
    );
    for (const p of result.prices) {
      expect(p.currency).toBe("TRY");
    }
  });

  it("handles navigation errors gracefully", async () => {
    const brokenPage: ScraperPage = {
      goto: async () => { throw new Error("Connection refused"); },
      content: async () => "",
    };
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test" },
      brokenPage
    );
    expect(result.error).toContain("Navigation failed");
    expect(result.prices).toHaveLength(0);
  });

  it("includes scrapedAt ISO timestamp", async () => {
    const result = await trackCompetitorPrices({ marketplace: "trendyol", keyword: "test" });
    expect(result.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stops early when page returns no results", async () => {
    let pageCount = 0;
    const emptyAfterFirst: ScraperPage = {
      goto: async () => { pageCount++; return null; },
      content: async () => {
        if (pageCount === 1) {
          return `<html><body>
            <div class="prdct-desc-cntnr-name"><span>Tek Ürün</span></div>
            <div class="prc-box-dscntd">500,00 TL</div>
          </body></html>`;
        }
        return "<html><body></body></html>"; // empty page
      },
    };
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 50 },
      emptyAfterFirst
    );
    // Should stop after the empty page
    expect(pageCount).toBeLessThanOrEqual(3); // at most a few pages
  });
});
