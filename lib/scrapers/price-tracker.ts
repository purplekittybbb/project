/**
 * Competitor price tracker — scrapes the top N results for a keyword
 * and returns their prices. Used to build category_trends and feed into
 * computeSafePrice's competitor-price input.
 *
 * EXTRACTION: Playwright DOM only via shared `extractSearchResultsFromPage`
 * (`page.evaluate`). No SSR HTML / regex price parsing in this module.
 *
 * CACHE RULE: Never persist a result unless `hasUsablePrices` is true
 * (at least one finite price &gt; 0). Callers and `upsertSharedPriceTrackScan`
 * both enforce this — ₺0 / bot-wall payloads must not poison shared cache.
 *
 * ARCHITECTURE RULE: Accepts ScraperPage for mock injection (same pattern
 * as lib/scrapers/visibility.ts). Session lifecycle is owned by the caller.
 *
 * HARD LIMIT: Never call in a loop. maxResults cap enforced inside the function.
 */

import type { ScraperPage } from "./browser";
import {
  extractSearchResultsFromPage,
  hasUsableSearchResults,
  NO_USABLE_SCRAPE_ERROR,
} from "./extract-search-results";
import {
  buildSearchUrl,
  readGotoHttpStatus,
  detectConfirmedBlock,
} from "./visibility";

/** Shared DOM extractor — re-exported so price-track callers use one path. */
export { extractSearchResultsFromPage } from "./extract-search-results";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompetitorPrice {
  title: string;
  price: number;
  currency: string;
  rank: number;
}

export interface PriceTrackInput {
  marketplace: "trendyol" | "hepsiburada" | "n11";
  keyword: string;
  /** Default 20, hard max 50. */
  maxResults?: number;
}

export interface PriceTrackResult {
  keyword: string;
  marketplace: string;
  prices: CompetitorPrice[];
  stats: {
    min: number;
    max: number;
    median: number;
    p25: number;
    p75: number;
  };
  scrapedAt: string;
  error?: string;
}

const EMPTY_STATS = { min: 0, max: 0, median: 0, p25: 0, p75: 0 };

export function hasUsablePrices(result: Pick<PriceTrackResult, "prices" | "error">): boolean {
  if (result.error) return false;
  return result.prices.some((p) => Number.isFinite(p.price) && p.price > 0);
}

/**
 * Gate for any shared / Redis-adjacent result cache write.
 * Returns false when there is no finite price &gt; 0 (or an error is set).
 */
export function shouldCachePriceTrackResult(
  result: Pick<PriceTrackResult, "prices" | "error">,
): boolean {
  return hasUsablePrices(result);
}

// ── Pure statistics helper ────────────────────────────────────────────────────

/**
 * Compute price statistics for a sorted array of numbers.
 * Exported for unit testing — pure function, no I/O.
 *
 * Zero / non-finite values are ignored. Returns all-zero stats when nothing usable remains.
 */
export function computePriceStats(prices: number[]): PriceTrackResult["stats"] {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length === 0) {
    return { ...EMPTY_STATS };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const n = sorted.length;

  function percentile(p: number): number {
    const idx = (p / 100) * (n - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const frac = idx - lower;
    return sorted[lower] * (1 - frac) + sorted[upper] * frac;
  }

  return {
    min: sorted[0],
    max: sorted[n - 1],
    median: percentile(50),
    p25: percentile(25),
    p75: percentile(75),
  };
}

// ── Main tracker ──────────────────────────────────────────────────────────────

const RESULTS_PER_PAGE = 24;
const HARD_MAX_RESULTS = 50;
const DEFAULT_MAX_RESULTS = 20;

function emptyResult(
  keyword: string,
  marketplace: string,
  scrapedAt: string,
  error: string,
  prices: CompetitorPrice[] = [],
): PriceTrackResult {
  return {
    keyword,
    marketplace,
    prices,
    stats: computePriceStats(prices.map((c) => c.price)),
    scrapedAt,
    error,
  };
}

/**
 * Scrape competitor prices for a keyword.
 *
 * Uses live-DOM extraction only (`extractSearchResultsFromPage` / page.evaluate).
 * Never caches or returns a success envelope when no price &gt; 0 was found.
 *
 * Never throws — returns a safe error result on failure.
 */
export async function trackCompetitorPrices(
  input: PriceTrackInput,
  page?: ScraperPage,
): Promise<PriceTrackResult> {
  const { marketplace, keyword } = input;
  const maxResults = Math.min(input.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS);
  const scrapedAt = new Date().toISOString();

  if (!page) {
    return emptyResult(
      keyword,
      marketplace,
      scrapedAt,
      "No browser page provided — call with a ScraperPage instance.",
    );
  }

  const collected: CompetitorPrice[] = [];
  const maxPages = Math.ceil(maxResults / RESULTS_PER_PAGE);
  let globalRank = 0;

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (collected.length >= maxResults) break;

      const url = buildSearchUrl(marketplace, keyword, pageNum);
      let httpStatus: number | undefined;

      try {
        const gotoResult = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        httpStatus = readGotoHttpStatus(gotoResult);
      } catch (navErr) {
        return emptyResult(
          keyword,
          marketplace,
          scrapedAt,
          `Navigation failed on page ${pageNum}: ${String(navErr)}`,
          collected,
        );
      }

      const { results: pageResults } = await extractSearchResultsFromPage(page, marketplace, pageNum);

      if (pageResults.length === 0) {
        const html = await page.content();
        const blocked = detectConfirmedBlock(httpStatus, html);
        if (blocked) {
          return emptyResult(
            keyword,
            marketplace,
            scrapedAt,
            NO_USABLE_SCRAPE_ERROR,
            collected,
          );
        }
        break;
      }

      for (const result of pageResults) {
        if (collected.length >= maxResults) break;
        if (!Number.isFinite(result.price) || result.price <= 0) continue;
        globalRank++;
        collected.push({
          title: result.title,
          price: result.price,
          currency: "TRY",
          rank: globalRank,
        });
      }

      // Titles present but every price is 0 → treat as bot/empty, do not continue
      if (!hasUsableSearchResults(pageResults) && collected.length === 0) {
        return emptyResult(keyword, marketplace, scrapedAt, NO_USABLE_SCRAPE_ERROR);
      }
    }

    const draft: PriceTrackResult = {
      keyword,
      marketplace,
      prices: collected,
      stats: computePriceStats(collected.map((c) => c.price)),
      scrapedAt,
    };

    if (!hasUsablePrices(draft)) {
      return emptyResult(keyword, marketplace, scrapedAt, NO_USABLE_SCRAPE_ERROR);
    }

    return draft;
  } catch (err) {
    return emptyResult(keyword, marketplace, scrapedAt, `Scraping error: ${String(err)}`, collected);
  }
}
