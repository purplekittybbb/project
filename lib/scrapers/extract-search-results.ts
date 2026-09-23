/**
 * Shared marketplace SERP extraction — live DOM via page.evaluate only.
 * No SSR HTML / regex price parsing.
 */

import type { ScraperPage } from "./browser";

export type MarketplaceId = "trendyol" | "hepsiburada" | "n11";

export interface SearchResult {
  title: string;
  price: number;
  /** 1-indexed position within the page. */
  position: number;
  pageNumber: number;
}

/** Shown when extraction yields no price > 0 (empty SERP or bot wall). */
export const NO_USABLE_SCRAPE_ERROR =
  "Sonuç bulunamadı veya bot engeline takıldı";

/** Primary + fallback card selectors (order matters). */
export const CARD_SELECTOR_FALLBACKS: Record<MarketplaceId, readonly string[]> = {
  trendyol: [
    '[data-testid="product-card"]',
    ".p-card-wrppr",
    "[class*='product-card']",
    "[class*='productCard']",
    "[class*='prdct-desc-cntnr-name']",
    "article",
  ],
  hepsiburada: [
    '[data-test-id="product-card-name"]',
    "[data-test-id='product-card']",
    "[class*='product-card']",
    "article",
  ],
  n11: [".pro-title", "[class*='productName']", "article"],
};

/**
 * Runs inside the browser via page.evaluate — must stay a plain function
 * with no module closures (Playwright serializes it).
 */
export function extractCardsInBrowser(args: {
  selectors: readonly string[];
  pageNum: number;
}): SearchResult[] {
  const { selectors, pageNum } = args;

  function textOf(el: Element): string {
    const h = el as HTMLElement;
    return (h.innerText ?? h.textContent ?? "").trim();
  }

  function parsePriceToken(txt: string): number {
    const clean = txt.replace(/\./g, "").replace(",", ".").match(/[\d.]+/);
    if (!clean) return 0;
    const val = parseFloat(clean[0]);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }

  function bestPriceInRoot(root: Element): number {
    let best = 0;
    const consider = (txt: string) => {
      if (!/\d/.test(txt) || !/TL|₺/.test(txt)) return;
      const val = parsePriceToken(txt);
      if (val > best) best = val;
    };
    consider(textOf(root));
    root.querySelectorAll("*").forEach((el) => {
      if (el.children.length === 0) consider(textOf(el));
    });
    return best;
  }

  function extractPrice(card: Element): number {
    let best = bestPriceInRoot(card);
    if (best > 0) return best;

    // Title-as-card selectors (HB/N11): price often lives on following siblings
    let sib = card.nextElementSibling;
    while (sib) {
      if (
        sib.matches(
          "h3, [data-testid='product-name'], [data-test-id='product-card-name'], .pro-title, [class*='product-name']",
        )
      ) {
        break;
      }
      best = bestPriceInRoot(sib);
      if (best > 0) return best;
      sib = sib.nextElementSibling;
    }

    if (card.parentElement) {
      best = bestPriceInRoot(card.parentElement);
    }
    return best;
  }

  let cards: NodeListOf<Element> | null = null;
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      cards = found;
      break;
    }
  }
  if (!cards) {
    cards = document.querySelectorAll(selectors[0] ?? '[data-testid="product-card"]');
  }

  const out: SearchResult[] = [];
  cards.forEach((card, idx) => {
    const titleEl =
      card.querySelector('[data-testid="product-name"]') ??
      card.querySelector('[data-testid="product-title"]') ??
      card.querySelector('[class*="product-name"]') ??
      card.querySelector('[class*="prdct-desc-cntnr-name"]') ??
      card.querySelector('[class*="title"]') ??
      card.querySelector("h3") ??
      card.querySelector("h2");

    // When the matched node is itself the title (HB/N11), use card text
    let title = titleEl ? textOf(titleEl) : "";
    if (!title) {
      const tag = card.tagName.toLowerCase();
      if (tag === "h2" || tag === "h3" || card.getAttribute("data-test-id") === "product-card-name") {
        title = textOf(card);
      } else if (card.classList?.contains("pro-title")) {
        title = textOf(card);
      }
    }

    const bestPrice = extractPrice(card);

    if (title) {
      out.push({ title, price: bestPrice, position: idx + 1, pageNumber: pageNum });
    }
  });
  return out;
}

async function waitForProductCards(
  page: ScraperPage,
  marketplace: MarketplaceId,
): Promise<string | null> {
  if (!page.waitForSelector) return CARD_SELECTOR_FALLBACKS[marketplace][0];

  for (const selector of CARD_SELECTOR_FALLBACKS[marketplace]) {
    try {
      await page.waitForSelector(selector, { timeout: 8_000 });
      return selector;
    } catch {
      // try next fallback
    }
  }
  return null;
}

/**
 * Extract search results from a live page via DOM evaluate only.
 * Never falls back to SSR HTML regex. Missing `page.evaluate` → empty results.
 */
export async function extractSearchResultsFromPage(
  page: ScraperPage,
  marketplace: MarketplaceId,
  pageNumber: number,
): Promise<{ results: SearchResult[]; matchedSelector: string | null }> {
  if (!page.evaluate) {
    return { results: [], matchedSelector: null };
  }

  const matchedSelector = await waitForProductCards(page, marketplace);
  const results = (await page.evaluate(extractCardsInBrowser, {
    selectors: CARD_SELECTOR_FALLBACKS[marketplace],
    pageNum: pageNumber,
  })) as SearchResult[];

  return { results: Array.isArray(results) ? results : [], matchedSelector };
}

/** True when at least one result has a finite price &gt; 0. */
export function hasUsableSearchResults(results: SearchResult[]): boolean {
  return results.some((r) => Number.isFinite(r.price) && r.price > 0);
}
