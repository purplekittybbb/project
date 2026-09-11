/**
 * Visibility scraper tests — uses mock ScraperPage objects with HTML fixtures.
 * NO real network requests are made; playwright is NOT imported in this file.
 */

import { describe, expect, it } from "vitest";
import {
  parseTrendyolResults,
  parseHepsiburadaResults,
  parseN11Results,
  buildSearchUrl,
  searchProductRank,
  checkIndex,
  type VisibilityCheckInput,
  type IndexCheckInput,
} from "../../lib/scrapers/visibility";
import type { ScraperPage } from "../../lib/scrapers/browser";

// ── HTML Fixtures (plausible, clearly marked as test data) ───────────────────

const TRENDYOL_FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Trendyol Arama - test fixture</title></head>
<body>
  <!-- TEST FIXTURE: Realistic Trendyol search result card structure -->
  <div class="p-card-wrppr" data-id="1">
    <div class="prdct-desc-cntnr-name">
      <span>Siyah Bluetooth Kulaklık Pro X200</span>
    </div>
    <div class="prc-box-dscntd">1.299,00 TL</div>
  </div>
  <div class="p-card-wrppr" data-id="2">
    <div class="prdct-desc-cntnr-name">
      <span>Beyaz Bluetooth Kulaklık Premium Z500</span>
    </div>
    <div class="prc-box-sllng">899,90 TL</div>
  </div>
  <div class="p-card-wrppr" data-id="3">
    <div class="prdct-desc-cntnr-name">
      <span>Gaming Kulaklık RGB Led X900</span>
    </div>
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
  <!-- TEST FIXTURE: Realistic Hepsiburada search result structure -->
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
  <!-- TEST FIXTURE: Realistic N11 search result structure -->
  <h3 class="pro-title">Kulaklık N11 Ürün Birinci</h3>
  <div class="priceValue">650,00 TL</div>

  <h3 class="pro-title">Kulaklık N11 Ürün İkinci</h3>
  <div class="priceValue">1.100,75 TL</div>

  <h3 class="pro-title">Kulaklık N11 Ürün Üçüncü</h3>
  <div class="priceValue">450,00 TL</div>
</body>
</html>
`;

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
    // URL may be percent-encoded — check either form
    expect(url).toContain(encodeURIComponent("kulaklık").substring(0, 5));
  });

  it("builds N11 URL", () => {
    const url = buildSearchUrl("n11", "kulaklık", 3);
    expect(url).toContain("n11.com");
    expect(url).toContain("3");
  });
});

// ── parseTrendyolResults ──────────────────────────────────────────────────────

describe("parseTrendyolResults", () => {
  it("parses product names from fixture HTML", () => {
    const results = parseTrendyolResults(TRENDYOL_FIXTURE_HTML, 1);
    const titles = results.map((r) => r.title);
    // All three products should be found
    expect(titles.some((t) => t.includes("Pro X200"))).toBe(true);
    expect(titles.some((t) => t.includes("Z500"))).toBe(true);
    expect(titles.some((t) => t.includes("X900"))).toBe(true);
  });

  it("assigns sequential positions starting at 1", () => {
    const results = parseTrendyolResults(TRENDYOL_FIXTURE_HTML, 1);
    if (results.length >= 2) {
      expect(results[0].position).toBe(1);
      expect(results[1].position).toBe(2);
    }
  });

  it("assigns correct page number", () => {
    const results = parseTrendyolResults(TRENDYOL_FIXTURE_HTML, 3);
    expect(results.every((r) => r.pageNumber === 3)).toBe(true);
  });

  it("returns empty array for empty HTML", () => {
    const results = parseTrendyolResults("<html></html>", 1);
    expect(results).toHaveLength(0);
  });

  it("parses prices as numbers", () => {
    const results = parseTrendyolResults(TRENDYOL_FIXTURE_HTML, 1);
    for (const r of results) {
      expect(typeof r.price).toBe("number");
      expect(r.price).toBeGreaterThan(0);
    }
  });
});

// ── parseHepsiburadaResults ───────────────────────────────────────────────────

describe("parseHepsiburadaResults", () => {
  it("parses product names from Hepsiburada fixture", () => {
    const results = parseHepsiburadaResults(HEPSIBURADA_FIXTURE_HTML, 1);
    const titles = results.map((r) => r.title);
    expect(titles.some((t) => t.includes("Model A1"))).toBe(true);
    expect(titles.some((t) => t.includes("Model B2"))).toBe(true);
  });

  it("assigns correct page number", () => {
    const results = parseHepsiburadaResults(HEPSIBURADA_FIXTURE_HTML, 2);
    expect(results.every((r) => r.pageNumber === 2)).toBe(true);
  });

  it("returns empty array for empty HTML", () => {
    const results = parseHepsiburadaResults("<html></html>", 1);
    expect(results).toHaveLength(0);
  });
});

// ── parseN11Results ───────────────────────────────────────────────────────────

describe("parseN11Results", () => {
  it("parses product names from N11 fixture", () => {
    const results = parseN11Results(N11_FIXTURE_HTML, 1);
    const titles = results.map((r) => r.title);
    expect(titles.some((t) => t.includes("Birinci"))).toBe(true);
    expect(titles.some((t) => t.includes("İkinci"))).toBe(true);
  });

  it("assigns correct positions", () => {
    const results = parseN11Results(N11_FIXTURE_HTML, 1);
    if (results.length >= 3) {
      expect(results[0].position).toBe(1);
      expect(results[2].position).toBe(3);
    }
  });

  it("returns empty array for empty HTML", () => {
    const results = parseN11Results("<html></html>", 1);
    expect(results).toHaveLength(0);
  });
});

// ── searchProductRank — mock page ─────────────────────────────────────────────

/** Create a mock ScraperPage that returns the given HTML for every goto(). */
function makeMockPage(pages: string[]): ScraperPage {
  let callCount = 0;
  return {
    goto: async (_url: string) => {
      callCount++;
      return null;
    },
    content: async () => {
      const idx = Math.max(0, callCount - 1);
      return pages[idx] ?? "<html></html>";
    },
  };
}

/**
 * Make a Trendyol page that contains a specific product name on a specific page.
 * Pages before `targetPage` return empty HTML.
 */
function makePageWithProductOnPage(
  productTitle: string,
  targetPage: number,
  totalPages: number
): ScraperPage {
  let callCount = 0;
  return {
    goto: async (_url: string) => {
      callCount++;
      return null;
    },
    content: async () => {
      const currentPage = callCount; // matches the page we navigated to
      if (currentPage === targetPage) {
        return `
          <html>
          <body>
            <div class="prdct-desc-cntnr-name"><span>${productTitle}</span></div>
            <div class="prc-box-dscntd">999,00 TL</div>
          </body>
          </html>
        `;
      }
      // Return a page with unrelated products
      return `
        <html>
        <body>
          <div class="prdct-desc-cntnr-name"><span>Alakasız Ürün ${currentPage}</span></div>
          <div class="prc-box-dscntd">100,00 TL</div>
        </body>
        </html>
      `;
    },
  };
  void totalPages; // used for clarity in test name
}

describe("searchProductRank", () => {
  it("finds product on page 1 → rank = position within that page", async () => {
    // Build HTML with our target as the 3rd item
    const html = `
      <html>
      <body>
        <div class="prdct-desc-cntnr-name"><span>Başka Ürün Bir</span></div>
        <div class="prc-box-dscntd">100,00 TL</div>
        <div class="prdct-desc-cntnr-name"><span>Başka Ürün İki</span></div>
        <div class="prc-box-sllng">200,00 TL</div>
        <div class="prdct-desc-cntnr-name"><span>Hedef Ürün Pro X200</span></div>
        <div class="prc-box-dscntd">500,00 TL</div>
      </body>
      </html>
    `;
    const mockPage = makeMockPage([html]);
    const input: VisibilityCheckInput = {
      marketplace: "trendyol",
      keyword: "kulaklık",
      targetTitle: "Pro X200",
    };
    const result = await searchProductRank(input, mockPage);
    expect(result.found).toBe(true);
    expect(result.isIndexed).toBe(true);
    expect(result.isOnFirstPage).toBe(true);
    expect(result.rank).toBeDefined();
    expect(result.rank).toBeGreaterThan(0);
  });

  it("returns not found when product not in any page", async () => {
    const html = `
      <html>
      <body>
        <div class="prdct-desc-cntnr-name"><span>Alakasız Ürün A</span></div>
        <div class="prc-box-dscntd">100,00 TL</div>
      </body>
      </html>
    `;
    const mockPage = makeMockPage([html, html, html]); // 3 pages of unrelated products
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "HEDEF_YOK" },
      mockPage
    );
    expect(result.found).toBe(false);
    expect(result.isIndexed).toBe(false);
    expect(result.isOnFirstPage).toBe(false);
  });

  it("respects maxPages guard and stops after N pages", async () => {
    // Product is on page 4, but maxPages = 2
    let pageCount = 0;
    const limitedPage: ScraperPage = {
      goto: async (_url: string) => {
        pageCount++;
        return null;
      },
      content: async () => {
        if (pageCount === 4) {
          return `<html><body>
            <div class="prdct-desc-cntnr-name"><span>Hedef Ürün</span></div>
            <div class="prc-box-dscntd">999,00 TL</div>
          </body></html>`;
        }
        return `<html><body>
          <div class="prdct-desc-cntnr-name"><span>Alakasız ${pageCount}</span></div>
          <div class="prc-box-dscntd">100,00 TL</div>
        </body></html>`;
      },
    };

    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "test", targetTitle: "Hedef Ürün", maxPages: 2 },
      limitedPage
    );
    expect(result.found).toBe(false); // stopped before page 4
    expect(pageCount).toBe(2); // exactly 2 pages scraped
  });

  it("hard cap: maxPages is capped at 10 even if caller passes 99", async () => {
    // We just verify no error; this is a behavioural guard
    let pageCount = 0;
    const infinitePage: ScraperPage = {
      goto: async () => { pageCount++; return null; },
      content: async () => "<html><body><div class='prdct-desc-cntnr-name'><span>Other</span></div><div class='prc-box-dscntd'>1,00 TL</div></body></html>",
    };
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "x", targetTitle: "IMPOSSIBLE", maxPages: 99 },
      infinitePage
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
      goto: async () => { throw new Error("Network timeout"); },
      content: async () => "",
    };
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "test", targetTitle: "X" },
      brokenPage
    );
    expect(result.found).toBe(false);
    expect(result.error).toContain("Navigation failed");
  });

  it("case-insensitive title matching", async () => {
    const html = `
      <html>
      <body>
        <div class="prdct-desc-cntnr-name"><span>BÜYÜK HARF ÜRÜN XYZ</span></div>
        <div class="prc-box-dscntd">100,00 TL</div>
      </body>
      </html>
    `;
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: "ürün", targetTitle: "büyük harf ürün xyz" },
      makeMockPage([html])
    );
    expect(result.found).toBe(true);
  });
});

// ── checkIndex ────────────────────────────────────────────────────────────────

describe("checkIndex", () => {
  it("returns not_indexed when product not found", async () => {
    const result = await checkIndex(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "HEDEF_YOK" },
      makeMockPage(["<html></html>"])
    );
    expect(result.isIndexed).toBe(false);
    expect(result.status).toBe("not_indexed");
  });

  it("returns first_page when product is on page 1", async () => {
    const html = `
      <html>
      <body>
        <div class="prdct-desc-cntnr-name"><span>İlk Sayfa Ürün</span></div>
        <div class="prc-box-dscntd">100,00 TL</div>
      </body>
      </html>
    `;
    const result = await checkIndex(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "İlk Sayfa Ürün" },
      makeMockPage([html])
    );
    expect(result.isIndexed).toBe(true);
    expect(result.isOnFirstPage).toBe(true);
    expect(result.status).toBe("first_page");
  });

  it("returns deep_page when product is on page 2+", async () => {
    const emptyPage = `
      <html>
      <body>
        <div class="prdct-desc-cntnr-name"><span>Alakasız Ürün</span></div>
        <div class="prc-box-dscntd">100,00 TL</div>
      </body>
      </html>
    `;
    const targetPage = `
      <html>
      <body>
        <div class="prdct-desc-cntnr-name"><span>Derin Sayfa Ürün</span></div>
        <div class="prc-box-dscntd">200,00 TL</div>
      </body>
      </html>
    `;
    // page 1 = empty, page 2 = target
    let callCount = 0;
    const twoPageMock: ScraperPage = {
      goto: async () => { callCount++; return null; },
      content: async () => callCount === 1 ? emptyPage : targetPage,
    };
    const result = await checkIndex(
      { marketplace: "trendyol", keyword: "kulaklık", targetTitle: "Derin Sayfa Ürün", maxPages: 3 },
      twoPageMock
    );
    expect(result.isIndexed).toBe(true);
    expect(result.isOnFirstPage).toBe(false);
    expect(result.status).toBe("deep_page");
  });
});
