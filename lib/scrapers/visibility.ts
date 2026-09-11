/**
 * Visibility scraper — searchProductRank() and checkIndex().
 *
 * ARCHITECTURE RULE: All functions accept an optional `page` parameter
 * (ScraperPage from lib/scrapers/browser.ts).
 * When page is provided (testing), uses it directly.
 * When page is null/undefined (production), the caller must provide a session.
 *
 * This module NEVER creates a browser session internally — session lifecycle
 * is owned by the caller. This prevents runaway browser processes.
 *
 * HARD LIMIT: never call this in a loop without explicit per-iteration delay
 * and a maximum page count guard. The `maxPages` parameter enforces this.
 */

import type { ScraperPage } from "./browser";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisibilityCheckInput {
  marketplace: "trendyol" | "hepsiburada" | "n11";
  keyword: string;
  /** Match against product title. Case-insensitive substring match. */
  targetTitle: string;
  /** Default 3, hard max 10. Prevents infinite scraping loops. */
  maxPages?: number;
}

export interface SearchResult {
  title: string;
  price: number;
  /** 1-indexed position within the page. */
  position: number;
  pageNumber: number;
}

export interface VisibilityCheckResult {
  found: boolean;
  /** Global position: (page-1) * resultsPerPage + position */
  rank?: number;
  page?: number;
  isIndexed: boolean;
  isOnFirstPage: boolean;
  searchResultCount?: number;
  /** All results scraped (for category trend building). */
  results: SearchResult[];
  /** Set when the scrape failed gracefully. */
  error?: string;
}

// ── Index check types ─────────────────────────────────────────────────────────

export interface IndexCheckInput {
  marketplace: VisibilityCheckInput["marketplace"];
  keyword: string;
  targetTitle: string;
  maxPages?: number;
}

export interface IndexCheckResult {
  isIndexed: boolean;
  isOnFirstPage: boolean;
  rank?: number;
  status: "not_indexed" | "first_page" | "deep_page";
}

// ── URL builders ──────────────────────────────────────────────────────────────

export const RESULTS_PER_PAGE: Record<VisibilityCheckInput["marketplace"], number> = {
  trendyol: 36, // Updated 2026-09: Trendyol now shows 36 products per page
  hepsiburada: 24,
  n11: 24,
};

/** Selectors that indicate product cards have loaded, per marketplace. */
const CARD_READY_SELECTOR: Record<VisibilityCheckInput["marketplace"], string> = {
  trendyol:    '[data-testid="product-card"]',
  hepsiburada: '[data-test-id="product-card-name"]',
  n11:         ".pro-title",
};

/**
 * Build the search URL for a given marketplace, keyword, and page number.
 * Page numbers are 1-indexed.
 */
export function buildSearchUrl(
  marketplace: VisibilityCheckInput["marketplace"],
  keyword: string,
  page: number
): string {
  const encoded = encodeURIComponent(keyword);
  switch (marketplace) {
    case "trendyol":
      return `https://www.trendyol.com/sr?q=${encoded}&pi=${page}`;
    case "hepsiburada":
      return `https://www.hepsiburada.com/ara?q=${encoded}&sayfa=${page}`;
    case "n11":
      return `https://www.n11.com/arama?q=${encoded}&pg=${page}`;
  }
}

// ── HTML parsers (CSS-selector-based, works on raw HTML strings) ──────────────

/**
 * Parse Trendyol search result HTML.
 *
 * Trendyol product cards use:
 *   .p-card-wrppr — outer card wrapper
 *   .prdct-desc-cntnr-name span — product name
 *   .prc-box-dscntd, .prc-box-sllng — price containers
 */
export function parseTrendyolResults(html: string, pageNumber: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match product card blocks
  const cardPattern = /<div[^>]*class="[^"]*p-card-wrppr[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;

  // Fallback: extract by data-id attributes (Trendyol typically uses data-id for product tracking)
  // We use a simpler approach: extract all product name + price pairs from structured markup
  const namePattern = /class="[^"]*prdct-desc-cntnr-name[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/g;
  const pricePattern = /class="[^"]*(?:prc-box-dscntd|prc-box-sllng)[^"]*"[^>]*>([^<]*\d+[.,]\d*)/g;

  const names: string[] = [];
  const prices: number[] = [];

  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = namePattern.exec(html)) !== null) {
    names.push(nameMatch[1].trim());
  }

  let priceMatch: RegExpExecArray | null;
  while ((priceMatch = pricePattern.exec(html)) !== null) {
    const raw = priceMatch[1].replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const price = parseFloat(raw);
    if (!isNaN(price)) {
      prices.push(price);
    }
  }

  const count = Math.min(names.length, prices.length);
  for (let i = 0; i < count; i++) {
    results.push({
      title: names[i],
      price: prices[i],
      position: i + 1,
      pageNumber,
    });
  }

  // Suppress unused variable warning — cardPattern defined for documentation
  void cardPattern;

  return results;
}

/**
 * Parse Hepsiburada search result HTML.
 *
 * Hepsiburada uses:
 *   [data-test-id="product-card-name"]  — product title
 *   [data-test-id="price-current-price"] — current price
 */
export function parseHepsiburadaResults(html: string, pageNumber: number): SearchResult[] {
  const results: SearchResult[] = [];

  const namePattern = /data-test-id="product-card-name"[^>]*>([^<]+)<\/(?:h3|span|div|a)/g;
  const pricePattern = /data-test-id="price-current-price"[^>]*>([^<]*\d+[.,]\d*)/g;

  const names: string[] = [];
  const prices: number[] = [];

  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = namePattern.exec(html)) !== null) {
    names.push(nameMatch[1].trim());
  }

  let priceMatch: RegExpExecArray | null;
  while ((priceMatch = pricePattern.exec(html)) !== null) {
    const raw = priceMatch[1].replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const price = parseFloat(raw);
    if (!isNaN(price)) {
      prices.push(price);
    }
  }

  const count = Math.min(names.length, prices.length);
  for (let i = 0; i < count; i++) {
    results.push({
      title: names[i],
      price: prices[i],
      position: i + 1,
      pageNumber,
    });
  }

  return results;
}

/**
 * Parse N11 search result HTML.
 *
 * N11 uses:
 *   .pro-title / .title — product title
 *   .priceValue / .newPrice — price
 */
export function parseN11Results(html: string, pageNumber: number): SearchResult[] {
  const results: SearchResult[] = [];

  const namePattern = /class="[^"]*(?:pro-title|productName)[^"]*"[^>]*>\s*(?:<[^>]+>)*([^<]+)/g;
  const pricePattern = /class="[^"]*(?:priceValue|newPrice)[^"]*"[^>]*>([^<]*\d+[.,]\d*)/g;

  const names: string[] = [];
  const prices: number[] = [];

  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = namePattern.exec(html)) !== null) {
    const name = nameMatch[1].trim();
    if (name) names.push(name);
  }

  let priceMatch: RegExpExecArray | null;
  while ((priceMatch = pricePattern.exec(html)) !== null) {
    const raw = priceMatch[1].replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const price = parseFloat(raw);
    if (!isNaN(price)) {
      prices.push(price);
    }
  }

  const count = Math.min(names.length, prices.length);
  for (let i = 0; i < count; i++) {
    results.push({
      title: names[i],
      price: prices[i],
      position: i + 1,
      pageNumber,
    });
  }

  return results;
}

// ── Parser dispatcher ─────────────────────────────────────────────────────────

function parseResults(
  marketplace: VisibilityCheckInput["marketplace"],
  html: string,
  pageNumber: number
): SearchResult[] {
  switch (marketplace) {
    case "trendyol":
      return parseTrendyolResults(html, pageNumber);
    case "hepsiburada":
      return parseHepsiburadaResults(html, pageNumber);
    case "n11":
      return parseN11Results(html, pageNumber);
  }
}

// ── Anti-bot helpers (exported so other scrapers can reuse, not rewrite) ──────

/**
 * Wait for a random duration between minMs and maxMs.
 * Prevents bot-like constant-interval scraping patterns.
 *
 * In tests: override with SCRAPE_DELAY_MIN_MS=0 / SCRAPE_DELAY_MAX_MS=0.
 * In production: defaults to 2000–5000 ms.
 *
 * EXPORTED — import this in any scraper module; do NOT copy/rewrite.
 */
export function randomDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Signals that indicate a marketplace has blocked/rate-limited this IP. */
export const BLOCK_SIGNALS = [
  "captcha",
  "robot",
  "access denied",
  "403",
  "forbidden",
  "too many requests",
  "çok fazla istek",   // Turkish 429 page copy
];

/**
 * Check if a scrape result indicates the marketplace is blocking this IP.
 *
 * @param itemCount   - Number of items extracted from the page (0 = block signal).
 * @param errorText   - Optional error string from navigation/evaluation.
 * @returns true when scraping should stop (circuit breaker should increment).
 *
 * EXPORTED — import this in any scraper module; do NOT copy/rewrite.
 */
export function checkBlockSignal(itemCount: number, errorText?: string): boolean {
  if (errorText) {
    const lower = errorText.toLowerCase();
    if (BLOCK_SIGNALS.some((s) => lower.includes(s))) return true;
  }
  // 0 results on a page is a strong bot-block signal (real search always returns items)
  if (itemCount === 0) return true;
  return false;
}

// Internal alias used by the loop below
function isBlockSignal(results: SearchResult[], error?: string): boolean {
  return checkBlockSignal(results.length, error);
}

/**
 * Circuit breaker state — tracks consecutive block signals per scrape session.
 * Purely in-process; resets per invocation of searchProductRank.
 */
interface CircuitState {
  consecutiveBlocks: number;
  /** Max consecutive blocks before aborting the full scan. */
  maxBlocks: number;
}



/**
 * Search for a product by keyword on a marketplace and return its rank.
 *
 * Pages are scraped one at a time (up to `maxPages`). The first result whose
 * title contains `targetTitle` (case-insensitive) is returned as the rank.
 *
 * ANTI-BOT:
 *   - Random 2–5 s delay between pages (configurable via SCRAPE_DELAY_MIN_MS /
 *     SCRAPE_DELAY_MAX_MS env vars, both in milliseconds).
 *   - Circuit breaker: if 2 consecutive pages return block signals (0 results,
 *     403, captcha copy), scraping stops immediately and returns a "blocked"
 *     error. This prevents blind retries that worsen IP reputation.
 *
 * NEVER throws — returns a safe error result on any failure.
 */
export async function searchProductRank(
  input: VisibilityCheckInput,
  page?: ScraperPage
): Promise<VisibilityCheckResult> {
  const { marketplace, keyword, targetTitle } = input;
  const maxPages = Math.min(input.maxPages ?? 3, 10); // hard max: 10
  const resultsPerPage = RESULTS_PER_PAGE[marketplace];
  const lowerTarget = targetTitle.toLowerCase();

  // Anti-bot: read delay config from env (tests can override to 0)
  const delayMin = parseInt(process.env.SCRAPE_DELAY_MIN_MS ?? "2000", 10);
  const delayMax = parseInt(process.env.SCRAPE_DELAY_MAX_MS ?? "5000", 10);

  // Circuit breaker state for this scrape session
  const circuit: CircuitState = { consecutiveBlocks: 0, maxBlocks: 2 };

  if (!page) {
    return {
      found: false,
      isIndexed: false,
      isOnFirstPage: false,
      results: [],
      error: "No browser page provided — call with a ScraperPage instance.",
    };
  }

  const allResults: SearchResult[] = [];

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = buildSearchUrl(marketplace, keyword, pageNum);

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (navErr) {
        return {
          found: false,
          isIndexed: false,
          isOnFirstPage: false,
          results: allResults,
          error: `Navigation failed on page ${pageNum}: ${String(navErr)}`,
        };
      }

      // ── Live DOM path (Playwright): wait for cards then evaluate ─────────
      // ── Mock/test path (no evaluate): fall back to content() + regex ─────
      let pageResults: SearchResult[];

      if (page.evaluate) {
        // Wait for product cards to appear (SPA hydration)
        if (page.waitForSelector) {
          await page.waitForSelector(CARD_READY_SELECTOR[marketplace], { timeout: 10_000 })
            .catch(() => { /* timeout is soft — still try to extract */ });
        }

        pageResults = await page.evaluate(
          ({ marketplace: mp, pageNum: pn, resultsPerPage: rpp }) => {
            const CARD_SELECTORS: Record<string, string> = {
              trendyol:    '[data-testid="product-card"]',
              hepsiburada: '[data-test-id="product-card-name"]',
              n11:         ".pro-title",
            };
            const cards = document.querySelectorAll(CARD_SELECTORS[mp] ?? '[data-testid="product-card"]');
            const out: Array<{ title: string; price: number; position: number; pageNumber: number }> = [];

            cards.forEach((card, idx) => {
              // Title: prefer data-testid="product-name", then h3, then first meaningful text
              const titleEl =
                card.querySelector('[data-testid="product-name"]') ??
                card.querySelector('[class*="product-name"]') ??
                card.querySelector('h3') ??
                card.querySelector('h2');
              const title = (titleEl as HTMLElement)?.innerText?.trim() ?? "";

              // Price: find the element whose text most cleanly looks like a TL price
              // Walk all descendants; pick the LAST one matching "digits TL" (avoids
              // crossed-out original prices and promotional text before the real price).
              let bestPrice = 0;
              card.querySelectorAll("*").forEach((el) => {
                const txt = (el as HTMLElement).innerText ?? "";
                // Match patterns like "259,80 TL" or "1.299 TL" (no child elements in text)
                if (el.children.length === 0 && /\d/.test(txt) && txt.includes("TL")) {
                  const clean = txt.replace(/\./g, "").replace(",", ".").match(/[\d.]+/);
                  if (clean) {
                    const val = parseFloat(clean[0]);
                    if (val > 0) bestPrice = val; // last valid price wins
                  }
                }
              });

              if (title) {
                out.push({ title, price: bestPrice, position: idx + 1, pageNumber: pn });
              }
            });

            // Apply resultsPerPage offset for global rank calculation consistency
            void rpp;
            return out;
          },
          { marketplace, pageNum, resultsPerPage },
        ) as SearchResult[];
      } else {
        // Test / mock path: content() returns pre-built HTML fixture
        const html = await page.content();
        pageResults = parseResults(marketplace, html, pageNum);
      }

      allResults.push(...pageResults);

      // ── Circuit breaker: stop if blocked ──────────────────────────────────
      if (isBlockSignal(pageResults)) {
        circuit.consecutiveBlocks++;
        console.warn("[visibility] Block signal on page %d (consecutive: %d). marketplace=%s keyword=%s",
          pageNum, circuit.consecutiveBlocks, marketplace, keyword);

        if (circuit.consecutiveBlocks >= circuit.maxBlocks) {
          console.error("[visibility] Circuit breaker OPEN — aborting scan. marketplace=%s keyword=%s",
            marketplace, keyword);
          return {
            found: false,
            isIndexed: false,
            isOnFirstPage: false,
            results: allResults,
            error: `Marketplace blocked further scraping after ${circuit.consecutiveBlocks} consecutive block signals. Aborting to protect IP reputation.`,
          };
        }
      } else {
        // Reset on a clean page
        circuit.consecutiveBlocks = 0;
      }

      // Check if any result matches the target
      for (const result of pageResults) {
        if (result.title.toLowerCase().includes(lowerTarget)) {
          const globalRank = (pageNum - 1) * resultsPerPage + result.position;
          return {
            found: true,
            rank: globalRank,
            page: pageNum,
            isIndexed: true,
            isOnFirstPage: pageNum === 1,
            results: allResults,
          };
        }
      }

      // ── Anti-bot: random delay before next page ────────────────────────────
      // Skip delay after the last page (no next request follows)
      if (pageNum < maxPages && delayMax > 0) {
        await randomDelay(delayMin, delayMax);
      }
    }

    // Not found within maxPages
    return {
      found: false,
      isIndexed: false,
      isOnFirstPage: false,
      results: allResults,
    };
  } catch (err) {
    return {
      found: false,
      isIndexed: false,
      isOnFirstPage: false,
      results: allResults,
      error: `Scraping error: ${String(err)}`,
    };
  }
}

// ── checkIndex (Task 8) ───────────────────────────────────────────────────────

/**
 * Determine if a product appears AT ALL in search results for a keyword
 * (within maxPages). Wraps searchProductRank with simpler input/output.
 */
export async function checkIndex(
  input: IndexCheckInput,
  page?: ScraperPage
): Promise<IndexCheckResult> {
  const result = await searchProductRank(
    {
      marketplace: input.marketplace,
      keyword: input.keyword,
      targetTitle: input.targetTitle,
      maxPages: input.maxPages,
    },
    page
  );

  if (!result.isIndexed) {
    return {
      isIndexed: false,
      isOnFirstPage: false,
      status: "not_indexed",
    };
  }

  return {
    isIndexed: true,
    isOnFirstPage: result.isOnFirstPage,
    rank: result.rank,
    status: result.isOnFirstPage ? "first_page" : "deep_page",
  };
}
