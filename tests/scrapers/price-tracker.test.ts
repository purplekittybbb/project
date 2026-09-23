/**
 * Price tracker tests — Chromium DOM evaluate mocks (no SSR regex).
 */

import { afterAll, describe, expect, it } from "vitest";
import {
  computePriceStats,
  hasUsablePrices,
  shouldCachePriceTrackResult,
  trackCompetitorPrices,
  type PriceTrackInput,
} from "../../lib/scrapers/price-tracker";
import { NO_USABLE_SCRAPE_ERROR } from "../../lib/scrapers/extract-search-results";
import type { ScraperPage } from "../../lib/scrapers/browser";
import { closeMockDomBrowser, makeDomMockPage } from "./mock-dom-page";

afterAll(async () => {
  await closeMockDomBrowser();
});

describe("computePriceStats", () => {
  it("returns all zeros for empty array", () => {
    const stats = computePriceStats([]);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.p25).toBe(0);
    expect(stats.p75).toBe(0);
  });

  it("ignores zero and non-finite prices", () => {
    const stats = computePriceStats([0, 100, Number.NaN, 200]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(200);
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
    expect(stats.median).toBe(150);
  });

  it("computes correct min/max/median for odd-count sorted array", () => {
    const stats = computePriceStats([300, 100, 500, 200, 400]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(500);
    expect(stats.median).toBe(300);
  });

  it("computes correct median for even-count array", () => {
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
  });
});

describe("hasUsablePrices", () => {
  it("returns false when error is set", () => {
    expect(
      hasUsablePrices({
        prices: [{ title: "x", price: 10, currency: "TRY", rank: 1 }],
        error: "blocked",
      }),
    ).toBe(false);
  });

  it("returns false when all prices are zero", () => {
    expect(
      hasUsablePrices({
        prices: [
          { title: "a", price: 0, currency: "TRY", rank: 1 },
          { title: "b", price: 0, currency: "TRY", rank: 2 },
        ],
      }),
    ).toBe(false);
  });

  it("returns true when at least one price > 0", () => {
    expect(
      hasUsablePrices({
        prices: [
          { title: "a", price: 0, currency: "TRY", rank: 1 },
          { title: "b", price: 199.9, currency: "TRY", rank: 2 },
        ],
      }),
    ).toBe(true);
  });

  it("shouldCachePriceTrackResult mirrors hasUsablePrices (no cache on ₺0)", () => {
    expect(
      shouldCachePriceTrackResult({
        prices: [{ title: "x", price: 0, currency: "TRY", rank: 1 }],
      }),
    ).toBe(false);
    expect(
      shouldCachePriceTrackResult({
        prices: [{ title: "x", price: 50, currency: "TRY", rank: 1 }],
      }),
    ).toBe(true);
  });
});

function makeMockPageWithProducts(productCount: number): ScraperPage {
  const items = Array.from(
    { length: productCount },
    (_, i) => `
    <div class="p-card-wrppr">
      <div class="prdct-desc-cntnr-name"><span>Ürün Başlık ${i + 1}</span></div>
      <div class="prc-box-dscntd">${(1000 + i * 100).toLocaleString("tr-TR")},00 TL</div>
    </div>`,
  ).join("\n");

  return makeDomMockPage([`<html><body>${items}</body></html>`]);
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
      mockPage,
    );
    expect(result.prices.length).toBe(5);
    expect(result.error).toBeUndefined();
    expect(hasUsablePrices(result)).toBe(true);
  });

  it("computes stats from collected prices", async () => {
    const mockPage = makeMockPageWithProducts(3);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 10 },
      mockPage,
    );
    expect(result.stats.min).toBeGreaterThan(0);
    expect(result.stats.max).toBeGreaterThanOrEqual(result.stats.min);
  });

  it("respects maxResults cap (hard max 50)", async () => {
    const mockPage = makeMockPageWithProducts(10);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 999 },
      mockPage,
    );
    expect(result.prices.length).toBeLessThanOrEqual(50);
  });

  it("assigns ranks starting at 1", async () => {
    const mockPage = makeMockPageWithProducts(3);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 10 },
      mockPage,
    );
    expect(result.prices[0].rank).toBe(1);
  });

  it("assigns currency TRY to all collected prices", async () => {
    const mockPage = makeMockPageWithProducts(3);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 10 },
      mockPage,
    );
    for (const p of result.prices) {
      expect(p.currency).toBe("TRY");
    }
  });

  it("handles navigation errors gracefully", async () => {
    const brokenPage: ScraperPage = {
      goto: async () => {
        throw new Error("Connection refused");
      },
      content: async () => "",
    };
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test" },
      brokenPage,
    );
    expect(result.error).toContain("Navigation failed");
    expect(result.prices).toHaveLength(0);
  });

  it("HTTP 429 rate limit → error envelope, no fake ₺0 success prices", async () => {
    const rateLimited: ScraperPage = {
      goto: async () => ({ status: () => 429 }),
      content: async () =>
        "<html><body><h1>Too Many Requests</h1><p>Çok fazla istek</p></body></html>",
      evaluate: async <T>(_fn?: (arg: unknown) => T) => [] as T,
      waitForSelector: async () => null,
    };
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "kulaklık", maxResults: 10 },
      rateLimited,
    );
    expect(result.error).toBe(NO_USABLE_SCRAPE_ERROR);
    expect(result.prices).toHaveLength(0);
    expect(hasUsablePrices(result)).toBe(false);
    expect(result.stats.min).toBe(0);
  });

  it("returns NO_USABLE error when mock page has no products", async () => {
    const emptyPage = makeDomMockPage(["<html><body></body></html>"]);
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "tofu soya ezmesi" },
      emptyPage,
    );
    expect(result.error).toBe(NO_USABLE_SCRAPE_ERROR);
    expect(result.prices).toHaveLength(0);
    expect(hasUsablePrices(result)).toBe(false);
  });

  it("zero-price cards → NO_USABLE error, not ₺0 success", async () => {
    const html = `<html><body>
      <div class="p-card-wrppr">
        <div class="prdct-desc-cntnr-name"><span>Fiyatsız Ürün</span></div>
      </div>
    </body></html>`;
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test" },
      makeDomMockPage([html]),
    );
    expect(result.error).toBe(NO_USABLE_SCRAPE_ERROR);
    expect(result.prices).toHaveLength(0);
    expect(hasUsablePrices(result)).toBe(false);
  });

  it("includes scrapedAt ISO timestamp", async () => {
    const result = await trackCompetitorPrices({ marketplace: "trendyol", keyword: "test" });
    expect(result.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stops early when page returns no results", async () => {
    process.env.SCRAPE_DELAY_MIN_MS = "0";
    process.env.SCRAPE_DELAY_MAX_MS = "0";
    const first = `<html><body>
      <div class="p-card-wrppr">
        <div class="prdct-desc-cntnr-name"><span>Tek Ürün</span></div>
        <div class="prc-box-dscntd">500,00 TL</div>
      </div>
    </body></html>`;
    const empty = "<html><body></body></html>";
    const result = await trackCompetitorPrices(
      { marketplace: "trendyol", keyword: "test", maxResults: 40 },
      makeDomMockPage([first, empty]),
    );
    expect(result.prices).toHaveLength(1);
    expect(result.prices[0].price).toBe(500);
  });
});
