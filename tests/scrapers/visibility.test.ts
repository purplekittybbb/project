/**
 * Visibility scraper tests — uses mock ScraperPage with Chromium DOM evaluate.
 * NO live marketplace network; playwright setContent only.
 */

import { afterAll, describe, expect, it } from "vitest";
import {
  buildSearchUrl,
  searchProductRank,
  checkIndex,
  detectConfirmedBlock,
  readGotoHttpStatus,
  extractSearchResultsFromPage,
} from "../../lib/scrapers/visibility";
import type { ScraperPage } from "../../lib/scrapers/browser";
import { closeMockDomBrowser, makeDomMockPage } from "./mock-dom-page";

afterAll(async () => {
  await closeMockDomBrowser();
});

// ── HTML Fixtures ─────────────────────────────────────────────────────────────

const TRENDYOL_FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Trendyol Arama - test fixture</title></head>
<body>
  <div class="p-card-wrppr" data-id="1">
    <div class="prdct-desc-cntnr-name"><span>Siyah Bluetooth Kulaklık Pro X200</span></div>
    <div class="prc-box-dscntd">1.299,00 TL</div>
  </div>
  <div class="p-card-wrppr" data-id="2">
    <div class="prdct-desc-cntnr-name"><span>Beyaz Bluetooth Kulaklık Premium Z500</span></div>
    <div class="prc-box-sllng">899,90 TL</div>
  </div>
  <div class="p-card-wrppr" data-id="3">
    <div class="prdct-desc-cntnr-name"><span>Gaming Kulaklık RGB Led X900</span></div>
    <div class="prc-box-dscntd">2.499,00 TL</div>
  </div>
</body>
</html>
`;

const HEPSIBURADA_FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Hepsiburada Arama - test fixture</title></head>
<body>
  <h3 data-test-id="product-card-name">Kablosuz Kulaklık Model A1</h3>
  <div data-test-id="price-current-price">1.499,00 TL</div>
  <h3 data-test-id="product-card-name">Kablosuz Kulaklık Model B2</h3>
  <div data-test-id="price-current-price">799,50 TL</div>
  <h3 data-test-id="product-card-name">Profesyonel Kulaklık Studio C3</h3>
  <div data-test-id="price-current-price">3.200,00 TL</div>
</body>
</html>
`;

const N11_FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<head><title>N11 Arama - test fixture</title></head>
<body>
  <h3 class="pro-title">Kulaklık N11 Ürün Birinci</h3>
  <div class="priceValue">650,00 TL</div>
  <h3 class="pro-title">Kulaklık N11 Ürün İkinci</h3>
  <div class="priceValue">1.100,75 TL</div>
  <h3 class="pro-title">Kulaklık N11 Ürün Üçüncü</h3>
  <div class="priceValue">450,00 TL</div>
</body>
</html>
`;

function trendyolCard(title: string, priceLabel: string): string {
  return `<div class="p-card-wrppr">
    <div class="prdct-desc-cntnr-name"><span>${title}</span></div>
    <div class="prc-box-dscntd">${priceLabel}</div>
  </div>`;
}

function makeMockPage(pages: string[]): ScraperPage {
  return makeDomMockPage(pages);
}

// ── detectConfirmedBlock ──────────────────────────────────────────────────────

describe("readGotoHttpStatus", () => {
  it("reads status without detaching the Response method", () => {
    const response = { status: () => 200 };
    expect(readGotoHttpStatus(response)).toBe(200);
  });

  it("returns undefined for null goto result", () => {
    expect(readGotoHttpStatus(null)).toBeUndefined();
  });
});

describe("detectConfirmedBlock", () => {
  it("detects HTTP 403 as confirmed block", () => {
    expect(detectConfirmedBlock(403, "normal page")).toBe(true);
  });

  it("detects HTTP 429 (Trendyol rate limit) as confirmed block", () => {
    expect(detectConfirmedBlock(429, "Too Many Requests")).toBe(true);
    expect(detectConfirmedBlock(429, "")).toBe(true);
  });

  it("detects Turkish 429 page copy as confirmed block", () => {
    expect(detectConfirmedBlock(200, "Çok fazla istek gönderdiniz")).toBe(true);
  });

  it("detects captcha copy in page text", () => {
    expect(detectConfirmedBlock(200, "Please complete the captcha challenge")).toBe(true);
  });

  it("does not treat empty SERP HTML as confirmed block", () => {
    expect(detectConfirmedBlock(200, "<html><body></body></html>")).toBe(false);
  });
});

// ── buildSearchUrl ─────────────────────────────────────────────────────────────

describe("buildSearchUrl", () => {
  it("builds Trendyol URL with encoded keyword and page", () => {
    const url = buildSearchUrl("trendyol", "bluetooth kulaklık", 2);
    expect(url).toContain("trendyol.com");
    expect(url).toContain(encodeURIComponent("bluetooth kulaklık"));
    expect(url).toContain("2");
  });

  it("builds Hepsiburada URL", () => {
    const url = buildSearchUrl("hepsiburada", "kulaklık", 1);
    expect(url).toContain("hepsiburada.com");
    expect(url).toContain(encodeURIComponent("kulaklık").substring(0, 5));
  });

  it("builds N11 URL", () => {
    const url = buildSearchUrl("n11", "kulaklık", 3);
    expect(url).toContain("n11.com");
    expect(url).toContain("3");
  });
});

// ── extractSearchResultsFromPage (DOM evaluate) ───────────────────────────────

describe("extractSearchResultsFromPage", () => {
  it("extracts Trendyol titles and prices via DOM", async () => {
    const page = makeDomMockPage([TRENDYOL_FIXTURE_HTML]);
    await page.goto("about:blank");
    const { results } = await extractSearchResultsFromPage(page, "trendyol", 1);
    const titles = results.map((r) => r.title);
    expect(titles.some((t) => t.includes("Pro X200"))).toBe(true);
    expect(titles.some((t) => t.includes("Z500"))).toBe(true);
    expect(titles.some((t) => t.includes("X900"))).toBe(true);
    expect(results.every((r) => r.price > 0)).toBe(true);
    expect(results.every((r) => r.pageNumber === 1)).toBe(true);
  });

  it("assigns sequential positions", async () => {
    const page = makeDomMockPage([TRENDYOL_FIXTURE_HTML]);
    await page.goto("about:blank");
    const { results } = await extractSearchResultsFromPage(page, "trendyol", 1);
    expect(results[0]?.position).toBe(1);
    expect(results[1]?.position).toBe(2);
  });

  it("extracts Hepsiburada sibling prices", async () => {
    const page = makeDomMockPage([HEPSIBURADA_FIXTURE_HTML]);
    await page.goto("about:blank");
    const { results } = await extractSearchResultsFromPage(page, "hepsiburada", 2);
    expect(results.some((r) => r.title.includes("Model A1"))).toBe(true);
    expect(results.every((r) => r.pageNumber === 2)).toBe(true);
    expect(results.every((r) => r.price > 0)).toBe(true);
  });

  it("extracts N11 products", async () => {
    const page = makeDomMockPage([N11_FIXTURE_HTML]);
    await page.goto("about:blank");
    const { results } = await extractSearchResultsFromPage(page, "n11", 1);
    expect(results.some((r) => r.title.includes("Birinci"))).toBe(true);
    expect(results.some((r) => r.title.includes("İkinci"))).toBe(true);
    expect(results.every((r) => r.price > 0)).toBe(true);
  });

  it("returns empty array for empty HTML", async () => {
    const page = makeDomMockPage(["<html></html>"]);
    await page.goto("about:blank");
    const { results } = await extractSearchResultsFromPage(page, "trendyol", 1);
    expect(results).toHaveLength(0);
  });

  it("returns empty when page.evaluate is missing (no regex fallback)", async () => {
    const page: ScraperPage = {
      goto: async () => null,
      content: async () => TRENDYOL_FIXTURE_HTML,
    };
    const { results } = await extractSearchResultsFromPage(page, "trendyol", 1);
    expect(results).toHaveLength(0);
  });
});

// ── searchProductRank ─────────────────────────────────────────────────────────

describe("searchProductRank", () => {
  it("finds product on page 1 → rank = position within that page", async () => {
    const html = `<html><body>
      ${trendyolCard("Başka Ürün Bir", "100,00 TL")}
      ${trendyolCard("Başka Ürün İki", "200,00 TL")}
      ${trendyolCard("Hedef Ürün Pro X200", "500,00 TL")}
    </body></html>`;
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "Pro X200" },
      makeMockPage([html]),
    );
    expect(result.found).toBe(true);
    expect(result.isIndexed).toBe(true);
    expect(result.isOnFirstPage).toBe(true);
    expect(result.rank).toBe(3);
  });

  it("returns not found when product not in any page", async () => {
    const html = `<html><body>${trendyolCard("Alakasız Ürün A", "100,00 TL")}</body></html>`;
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "HEDEF_YOK" },
      makeMockPage([html, html, html]),
    );
    expect(result.found).toBe(false);
    expect(result.isIndexed).toBe(false);
  });

  it("respects maxPages guard and stops after N pages", async () => {
    let pageCount = 0;
    const pages = [
      `<html><body>${trendyolCard("Alakasız 1", "100,00 TL")}</body></html>`,
      `<html><body>${trendyolCard("Alakasız 2", "100,00 TL")}</body></html>`,
      `<html><body>${trendyolCard("Hedef Ürün", "999,00 TL")}</body></html>`,
    ];
    const limitedPage = makeDomMockPage(pages);
    const origGoto = limitedPage.goto.bind(limitedPage);
    limitedPage.goto = async (url, opts) => {
      pageCount++;
      return origGoto(url, opts);
    };

    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "test", targetTitle: "Hedef Ürün", maxPages: 2 },
      limitedPage,
    );
    expect(result.found).toBe(false);
    expect(pageCount).toBe(2);
  });

  it("hard cap: maxPages is capped at 10 even if caller passes 99", async () => {
    process.env.SCRAPE_DELAY_MIN_MS = "0";
    process.env.SCRAPE_DELAY_MAX_MS = "0";
    let pageCount = 0;
    const html = `<html><body>${trendyolCard("Other", "1,00 TL")}</body></html>`;
    const pages = Array.from({ length: 12 }, () => html);
    const infinitePage = makeDomMockPage(pages);
    const origGoto = infinitePage.goto.bind(infinitePage);
    infinitePage.goto = async (url, opts) => {
      pageCount++;
      return origGoto(url, opts);
    };
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "x", targetTitle: "IMPOSSIBLE", maxPages: 99 },
      infinitePage,
    );
    expect(pageCount).toBeLessThanOrEqual(10);
    expect(result.found).toBe(false);
  });

  it("returns error result when page is not provided (no browser)", async () => {
    const result = await searchProductRank({
      marketplace: "trendyol",
      keyword: "kulaklık",
      targetTitle: "Ürün",
    });
    expect(result.found).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.results).toHaveLength(0);
  });

  it("handles navigation errors gracefully", async () => {
    const brokenPage: ScraperPage = {
      goto: async () => {
        throw new Error("Network timeout");
      },
      content: async () => "",
    };
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "test", targetTitle: "X" },
      brokenPage,
    );
    expect(result.found).toBe(false);
    expect(result.error).toContain("Navigation failed");
  });

  it("case-insensitive title matching", async () => {
    const html = `<html><body>${trendyolCard("BÜYÜK HARF ÜRÜN XYZ", "100,00 TL")}</body></html>`;
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "ürün", targetTitle: "büyük harf ürün xyz" },
      makeMockPage([html]),
    );
    expect(result.found).toBe(true);
  });

  it("HTTP 429 rate limit → not found + error, does not invent a rank", async () => {
    const rateLimited: ScraperPage = {
      goto: async () => ({ status: () => 429 }),
      content: async () =>
        "<html><body><h1>Too Many Requests</h1><p>çok fazla istek</p></body></html>",
      title: async () => "429",
      evaluate: async <T>(_fn?: (arg: unknown) => T) => [] as T,
      waitForSelector: async () => null,
    };
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "Hedef" },
      rateLimited,
    );
    expect(result.found).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.errorCode).toBe("confirmed_block");
    expect(result.rank).toBeUndefined();
  });
});

// ── checkIndex ────────────────────────────────────────────────────────────────

describe("checkIndex", () => {
  it("returns not_indexed when product not found", async () => {
    const result = await checkIndex(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "HEDEF_YOK" },
      makeMockPage(["<html></html>"]),
    );
    expect(result.isIndexed).toBe(false);
    expect(result.status).toBe("not_indexed");
  });

  it("returns first_page when product is on page 1", async () => {
    const html = `<html><body>${trendyolCard("İlk Sayfa Ürün", "100,00 TL")}</body></html>`;
    const result = await checkIndex(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "İlk Sayfa Ürün" },
      makeMockPage([html]),
    );
    expect(result.isIndexed).toBe(true);
    expect(result.isOnFirstPage).toBe(true);
    expect(result.status).toBe("first_page");
  });

  it("returns deep_page when product is on page 2+", async () => {
    process.env.SCRAPE_DELAY_MIN_MS = "0";
    process.env.SCRAPE_DELAY_MAX_MS = "0";
    const emptyPage = `<html><body>${trendyolCard("Alakasız Ürün", "100,00 TL")}</body></html>`;
    const targetPage = `<html><body>${trendyolCard("Derin Sayfa Ürün", "200,00 TL")}</body></html>`;
    const result = await checkIndex(
      {
        marketplace: "trendyol",
        keyword: "kulaklık",
        targetTitle: "Derin Sayfa Ürün",
        maxPages: 3,
      },
      makeMockPage([emptyPage, targetPage]),
    );
    expect(result.isIndexed).toBe(true);
    expect(result.isOnFirstPage).toBe(false);
    expect(result.status).toBe("deep_page");
  });
});
