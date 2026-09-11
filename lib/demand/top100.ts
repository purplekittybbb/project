/**
 * Top 100 Analysis — category-wide competitor ranking via marketplace scraping.
 *
 * DATA SOURCE: Marketplace search page scraping (not user portfolio).
 * Rationale: "Top 100 in category" requires a representative sample of the
 * full search results page, not just the products a specific user tracks.
 * User portfolio data feeds SINGLE-PRODUCT demand signals (stockDelta); this
 * module answers the separate question "what does the competitive landscape
 * look like for a keyword/category?"
 *
 * ANTI-BOT: Uses randomDelay() and checkBlockSignal() exported from
 * lib/scrapers/visibility.ts — the SAME mechanism as Item 4 anti-bot
 * circuit breaker. Never duplicated here; always imported.
 *
 * HARD LIMITS:
 *   - At most 3 pages (≤108 items on Trendyol @ 36/page).
 *   - Circuit breaker: 2 consecutive block signals → abort.
 *   - Session lifecycle owned by caller; this module never creates a browser.
 *   - First live run requires explicit user approval (no auto-trigger).
 */

import type { ScraperPage } from "../scrapers/browser";
import {
  buildSearchUrl,
  randomDelay,
  checkBlockSignal,
  RESULTS_PER_PAGE,
  parseTrendyolResults,
  parseHepsiburadaResults,
  parseN11Results,
  type VisibilityCheckInput,
} from "../scrapers/visibility";
import { computePriceStats } from "../scrapers/price-tracker";
import { estimateDemand, type DemandRangeResult } from "./signals";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Top100Marketplace = VisibilityCheckInput["marketplace"];

export interface Top100Item {
  rank: number;
  title: string;
  price: number;
  currency: string;
  /** Scraped from listing — not always available. */
  reviewCount?: number;
  /** Rating 1–5 — scraped, optional. */
  ratingScore?: number;
  /**
   * Per-item demand range estimate using the demand-engine format.
   *
   * Input signals available for competitor products:
   *   priceSignal — item price vs. category median price (always available)
   *
   * Signals NOT available for competitor products:
   *   stockDelta — requires access to the competitor's transaction data
   *   reviewVelocity — requires two time-point snapshots
   *   favoriteSignal — not exposed by marketplaces we scrape
   *
   * Without stockDelta the base range is [0, 1000] with confidenceScore=20.
   * The priceSignal multiplier adjusts it to [0, 850]–[0, 1300] depending on
   * price position. This is intentionally low-confidence — honest output per
   * the XAI calibration principle. When the user's own transaction data is
   * available for a matching SKU, the caller should merge it separately.
   */
  demandEstimate: DemandRangeResult;
}

export interface Top100AnalysisInput {
  marketplace: Top100Marketplace;
  keyword: string;
  /** Default 100, max 100. */
  maxItems?: number;
}

export interface Top100AnalysisResult {
  keyword: string;
  marketplace: string;
  items: Top100Item[];
  /** Price distribution across all scraped items. */
  priceStats: {
    p25: number;
    p50: number;
    p75: number;
    min: number;
    max: number;
  };
  /** Review count distribution — only set when ≥10 review counts collected. */
  reviewStats?: {
    p25: number;
    p50: number;
    p75: number;
  };
  /**
   * Competitive entry barrier estimate: median review count of the top-20
   * results. Represents the minimum social-proof threshold a new listing
   * needs to compete on page 1.
   */
  entryBarrierEstimate?: number;
  /**
   * Aggregate confidence for the whole analysis.
   * 100 = full 100 items scraped cleanly.
   * Decreases with partial results and circuit-breaker aborts.
   */
  aggregateConfidence: number;
  analysedAt: string;
  /** true when fewer items collected than requested. */
  isPartial: boolean;
  /** Set when the analysis failed or was aborted. */
  error?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute percentile statistics for an array of review counts.
 * Exported for unit testing — pure function.
 */
export function computeReviewStats(counts: number[]): { p25: number; p50: number; p75: number } {
  if (counts.length === 0) return { p25: 0, p50: 0, p75: 0 };

  const sorted = [...counts].sort((a, b) => a - b);
  const n = sorted.length;

  function percentile(p: number): number {
    const idx = (p / 100) * (n - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - idx + lower) + sorted[upper] * (idx - lower);
  }

  return { p25: percentile(25), p50: percentile(50), p75: percentile(75) };
}

/**
 * Compute the median of an array. Returns 0 for empty arrays.
 * Used for entry barrier estimate. Pure function.
 */
export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Build a per-item demand estimate using only the price signal.
 *
 * For competitor products we only have price (and sometimes review count).
 * The output is intentionally low-confidence (no stockDelta) — this is
 * correct and honest per the XAI calibration principle.
 */
export function buildItemDemandEstimate(
  itemPrice: number,
  marketMedianPrice: number,
): DemandRangeResult {
  return estimateDemand({
    price: {
      productPrice: itemPrice,
      marketMedianPrice: marketMedianPrice > 0 ? marketMedianPrice : itemPrice,
    },
  });
}

// ── Review count selectors — card-scoped, tried in order ─────────────────────
//
// STRATEGY: Extract review counts from WITHIN each product card (not page-wide).
// This avoids confusing page-level elements with per-product review counts.
//
// Trendyol class names change frequently. The selector list covers:
//   - data-testid attributes (most stable)
//   - known class name patterns as of 2025–2026
//   - broad class-contains patterns as final fallback before text heuristic
//
// If all selectors miss, a text-pattern heuristic scans for standalone numbers
// adjacent to star/rating context inside the card.
const CARD_REVIEW_SELECTORS = [
  // data-testid attributes (most stable — survives CSS renames)
  '[data-testid="rating-count"]',
  '[data-testid="review-count"]',
  '[data-testid="comment-count"]',
  // Known Trendyol class names
  '.ratingCount',
  '.review-count',
  '.pr-in-rnk',          // "pr-in-rnk" = product in-rank, often contains review count
  '.score-and-social-proof span',
  // Broad class-contains patterns (survive minor renames)
  '[class*="ratingCount"]',
  '[class*="reviewCount"]',
  '[class*="commentCount"]',
  '[class*="rating-count"]',
  '[class*="review-count"]',
  '[class*="pr-in-rnk"]',
];

/** Attempt to extract review counts page-wide (fallback for mock/test path). */
async function extractReviewCounts(page: ScraperPage): Promise<number[]> {
  if (!page.evaluate) return [];
  try {
    const counts = await page.evaluate((selectors: string[]) => {
      const found: number[] = [];
      for (const selector of selectors) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          els.forEach((el) => {
            const text = (el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? "";
            const match = text.replace(/\./g, "").replace(/,/g, "").match(/\d+/);
            if (match) {
              const val = parseInt(match[0], 10);
              if (!isNaN(val) && val >= 0) found.push(val);
            }
          });
          break;
        }
      }
      return found;
    }, CARD_REVIEW_SELECTORS);
    return Array.isArray(counts) ? counts : [];
  } catch {
    return [];
  }
}

// ── Parser dispatcher (mock/test path) ────────────────────────────────────────

function parsePageHtml(
  marketplace: Top100Marketplace,
  html: string,
  pageNum: number,
): Array<{ title: string; price: number; position: number; pageNumber: number }> {
  switch (marketplace) {
    case "trendyol":    return parseTrendyolResults(html, pageNum);
    case "hepsiburada": return parseHepsiburadaResults(html, pageNum);
    case "n11":         return parseN11Results(html, pageNum);
  }
}

// ── Main analysis function ────────────────────────────────────────────────────

/** Max pages to scrape (3 × 36 = 108 max items on Trendyol). */
const MAX_PAGES = 3;

/**
 * Analyze the top N search results for a keyword on a marketplace.
 *
 * Implementation notes:
 *   - Single unified scraping loop (no delegate to trackCompetitorPrices) so
 *     anti-bot delays are integrated correctly.
 *   - anti-bot: randomDelay + checkBlockSignal imported from visibility.ts
 *     (NOT rewritten here — same mechanism as Item 4).
 *   - Circuit breaker: maxBlocks=2 consecutive blocked pages → abort.
 *   - Per-item demandEstimate via estimateDemand({ price: ... }).
 *
 * IMPORTANT: Do not call against a live marketplace without explicit user
 * approval and a properly managed browser session.
 *
 * @param input - Analysis request.
 * @param page  - Optional ScraperPage (from createBrowserSession().page).
 * @returns Analysis result — never throws.
 */
export async function analyzeTop100(
  input: Top100AnalysisInput,
  page?: ScraperPage,
): Promise<Top100AnalysisResult> {
  const { marketplace, keyword } = input;
  const maxItems   = Math.min(input.maxItems ?? 100, 100);
  const analysedAt = new Date().toISOString();
  const emptyPrice = { p25: 0, p50: 0, p75: 0, min: 0, max: 0 };

  if (!page) {
    return {
      keyword, marketplace,
      items: [], priceStats: emptyPrice,
      aggregateConfidence: 0,
      analysedAt, isPartial: true,
      error: "No browser session",
    };
  }

  // ── Anti-bot config (env-override for tests) ────────────────────────────
  const delayMin = parseInt(process.env.SCRAPE_DELAY_MIN_MS ?? "2000", 10);
  const delayMax = parseInt(process.env.SCRAPE_DELAY_MAX_MS ?? "5000", 10);

  // ── Circuit breaker ─────────────────────────────────────────────────────
  const MAX_CONSECUTIVE_BLOCKS = 2;
  let consecutiveBlocks = 0;

  const resultsPerPage = RESULTS_PER_PAGE[marketplace];
  const maxPages = Math.min(Math.ceil(maxItems / resultsPerPage), MAX_PAGES);

  // ── Raw collection arrays ───────────────────────────────────────────────
  const rawItems: Array<{ title: string; price: number; rank: number; reviewCount?: number }> = [];
  let circuitOpenError: string | undefined;

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (rawItems.length >= maxItems) break;

      const url = buildSearchUrl(marketplace, keyword, pageNum);

      // Navigate
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (navErr) {
        circuitOpenError = `Navigation failed on page ${pageNum}: ${String(navErr)}`;
        break;
      }

      // Extract items
      let pageItems: Array<{ title: string; price: number; position: number }> = [];
      let reviewCounts: number[] = [];

      if (page.evaluate) {
        // ── Live DOM path ─────────────────────────────────────────────────────
        if (page.waitForSelector) {
          const cardSelectors: Record<Top100Marketplace, string> = {
            trendyol:    '[data-testid="product-card"]',
            hepsiburada: '[data-test-id="product-card-name"]',
            n11:         ".pro-title",
          };
          await page.waitForSelector(cardSelectors[marketplace], { timeout: 10_000 })
            .catch(() => { /* soft timeout — still try to extract */ });
        }

        // ── LAZY-LOAD FIX: Scroll to trigger review count rendering ──────────
        // Trendyol / SPA marketplaces defer review count rendering until
        // the product card scrolls into the viewport. Scrolling to the
        // bottom of the visible product list forces all cards to hydrate,
        // then we wait 800 ms for the deferred elements to appear.
        // This wait is in addition to the between-page randomDelay and is
        // scoped to review-count loading only — it does NOT affect the
        // circuit breaker or anti-bot delay logic.
        await page.evaluate(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
          return null;
        }).catch(() => null);
        await new Promise<void>((resolve) => setTimeout(resolve, 800));

        type LiveItem = { title: string; price: number; position: number; reviewCount: number | null };

        const liveItems: LiveItem[] = await page.evaluate(
          ({
            mp, pn, reviewSelectors,
          }: { mp: Top100Marketplace; pn: number; reviewSelectors: string[] }) => {
            void pn;
            const CARD: Record<string, string> = {
              trendyol:    '[data-testid="product-card"]',
              hepsiburada: '[data-test-id="product-card-name"]',
              n11:         ".pro-title",
            };
            const cards = document.querySelectorAll(CARD[mp] ?? '[data-testid="product-card"]');
            const out: LiveItem[] = [];

            // Contexts that indicate a number is a review/rating count
            const RATING_CONTEXT_WORDS = ["star", "rating", "review", "yorum", "değerlendirme", "puan", "oy"];

            cards.forEach((card, idx) => {
              // ── Title ─────────────────────────────────────────────────────
              const titleEl =
                card.querySelector('[data-testid="product-name"]') ??
                card.querySelector('[class*="product-name"]') ??
                card.querySelector("h3") ??
                card.querySelector("h2");
              const title = (titleEl as HTMLElement)?.innerText?.trim() ?? "";

              // ── Price — last numeric value containing "TL" ────────────────
              let bestPrice = 0;
              card.querySelectorAll("*").forEach((el) => {
                const txt = (el as HTMLElement).innerText ?? "";
                if (el.children.length === 0 && /\d/.test(txt) && txt.includes("TL")) {
                  const clean = txt.replace(/\./g, "").replace(",", ".").match(/[\d.]+/);
                  if (clean) {
                    const val = parseFloat(clean[0]);
                    if (val > 0) bestPrice = val;
                  }
                }
              });

              // ── Review count (card-scoped, multi-strategy) ────────────────
              // Strategy 1: known CSS selectors (card-scoped, most specific first)
              let reviewCount: number | null = null;
              for (const selector of reviewSelectors) {
                const el = card.querySelector(selector);
                if (el) {
                  const txt = ((el as HTMLElement).innerText ?? "").replace(/\./g, "").replace(/,/g, "");
                  const match = txt.match(/\d+/);
                  if (match) {
                    reviewCount = parseInt(match[0], 10);
                    break;
                  }
                }
              }

              // Strategy 2: text-pattern heuristic
              // Scan leaf text nodes inside the card for standalone numbers
              // that appear adjacent to star/rating context elements.
              if (reviewCount === null) {
                const leaves = Array.from(card.querySelectorAll("span, div, p, em, strong"));
                for (const el of leaves) {
                  const htmlEl = el as HTMLElement;
                  // Skip elements with children (look for leaf nodes with just a number)
                  if (htmlEl.children.length > 0) continue;
                  const raw = (htmlEl.innerText ?? htmlEl.textContent ?? "")
                    .trim().replace(/\./g, "").replace(/,/g, "");
                  if (!/^\d+$/.test(raw)) continue;
                  const n = parseInt(raw, 10);
                  if (n < 1 || n > 999_999) continue;

                  // Accept if parent or siblings contain rating-context words
                  const surroundingHtml = (
                    (htmlEl.parentElement?.innerHTML ?? "") +
                    (htmlEl.parentElement?.parentElement?.innerHTML ?? "")
                  ).toLowerCase();
                  if (RATING_CONTEXT_WORDS.some((w) => surroundingHtml.includes(w))) {
                    reviewCount = n;
                    break;
                  }
                }
              }

              if (title) out.push({ title, price: bestPrice, position: idx + 1, reviewCount });
            });

            return out;
          },
          { mp: marketplace, pn: pageNum, reviewSelectors: CARD_REVIEW_SELECTORS },
        ) as LiveItem[];

        pageItems = liveItems.map(({ title, price, position }) => ({ title, price, position }));
        reviewCounts = liveItems.map((i) => i.reviewCount ?? -1); // -1 = not available
      } else {
        // ── Test/mock path: HTML fixture via page.content() + regex parsers ──
        const html = await page.content();
        pageItems = parsePageHtml(marketplace, html, pageNum);
        reviewCounts = await extractReviewCounts(page);
      }

      // ── Circuit breaker: check for block signal ─────────────────────────
      if (checkBlockSignal(pageItems.length)) {
        consecutiveBlocks++;
        console.warn(
          "[top100] Block signal on page %d (consecutive: %d). marketplace=%s keyword=%s",
          pageNum, consecutiveBlocks, marketplace, keyword,
        );
        if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
          circuitOpenError = `Circuit breaker: marketplace blocked scraping after ${consecutiveBlocks} consecutive block signals.`;
          console.error("[top100] Circuit breaker OPEN. marketplace=%s keyword=%s", marketplace, keyword);
          break;
        }
      } else {
        consecutiveBlocks = 0;
      }

      // ── Collect items ───────────────────────────────────────────────────
      const globalOffset = (pageNum - 1) * resultsPerPage;
      for (let i = 0; i < pageItems.length; i++) {
        if (rawItems.length >= maxItems) break;
        const item = pageItems[i];
        const reviewCount = reviewCounts[i] !== undefined && reviewCounts[i] >= 0
          ? reviewCounts[i]
          : undefined;
        rawItems.push({
          title: item.title,
          price: item.price,
          rank: globalOffset + item.position,
          reviewCount,
        });
      }

      // ── Anti-bot delay before next page (same mechanism as visibility.ts) ──
      // Always call randomDelay so callers can verify anti-bot behaviour in tests.
      // When SCRAPE_DELAY_MIN_MS=0 and SCRAPE_DELAY_MAX_MS=0 (test env), this
      // resolves in 0ms — no test slowdown.
      if (pageNum < maxPages && rawItems.length < maxItems) {
        await randomDelay(delayMin, delayMax);
      }
    }
  } catch (err) {
    circuitOpenError = `Unexpected error: ${String(err)}`;
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const prices  = rawItems.map((i) => i.price).filter((p) => p > 0);
  const rawStats = computePriceStats(prices);
  const priceStats = {
    p25: rawStats.p25,
    p50: rawStats.median,
    p75: rawStats.p75,
    min: rawStats.min,
    max: rawStats.max,
  };

  const reviewCountsCollected = rawItems
    .map((i) => i.reviewCount)
    .filter((c): c is number => c != null && c >= 0);

  const reviewStats: Top100AnalysisResult["reviewStats"] =
    reviewCountsCollected.length >= 10
      ? computeReviewStats(reviewCountsCollected)
      : undefined;

  // Entry barrier: median review count of top-20 items with review data
  const top20Reviews = rawItems
    .slice(0, 20)
    .map((i) => i.reviewCount)
    .filter((c): c is number => c != null && c >= 0);

  const entryBarrierEstimate = top20Reviews.length > 0
    ? computeMedian(top20Reviews)
    : undefined;

  // ── Per-item demand estimates ────────────────────────────────────────────
  const medianPrice = priceStats.p50;
  const items: Top100Item[] = rawItems.map((raw) => ({
    rank: raw.rank,
    title: raw.title,
    price: raw.price,
    currency: "TRY",
    ...(raw.reviewCount != null ? { reviewCount: raw.reviewCount } : {}),
    demandEstimate: buildItemDemandEstimate(raw.price, medianPrice),
  }));

  // ── Aggregate confidence ─────────────────────────────────────────────────
  // 100 = scraped all requested items cleanly.
  // Penalise partial results proportionally; additional penalty for circuit-breaker abort.
  const coverageRatio = maxItems > 0 ? items.length / maxItems : 0;
  const aggregateConfidence = Math.round(
    coverageRatio * (circuitOpenError ? 40 : 80),
  );

  return {
    keyword,
    marketplace,
    items,
    priceStats,
    ...(reviewStats        ? { reviewStats }          : {}),
    ...(entryBarrierEstimate != null ? { entryBarrierEstimate } : {}),
    aggregateConfidence,
    analysedAt,
    isPartial: items.length < maxItems,
    ...(circuitOpenError ? { error: circuitOpenError } : {}),
  };
}
