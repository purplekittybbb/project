/**
 * Competitor price tracker — scrapes the top N results for a keyword
 * and returns their prices. Used to build category_trends and feed into
 * computeSafePrice's competitor-price input.
 *
 * ARCHITECTURE RULE: Accepts ScraperPage for mock injection (same pattern
 * as lib/scrapers/visibility.ts). Session lifecycle is owned by the caller.
 *
 * HARD LIMIT: Never call in a loop. maxResults cap enforced inside the function.
 */

import type { ScraperPage } from "./browser";
import { buildSearchUrl, parseTrendyolResults, parseHepsiburadaResults, parseN11Results } from "./visibility";

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

// ── Pure statistics helper ────────────────────────────────────────────────────

/**
 * Compute price statistics for a sorted array of numbers.
 * Exported for unit testing — pure function, no I/O.
 *
 * Returns all-zero stats for an empty array.
 */
export function computePriceStats(prices: number[]): PriceTrackResult["stats"] {
  if (prices.length === 0) {
    return { min: 0, max: 0, median: 0, p25: 0, p75: 0 };
  }

  const sorted = [...prices].sort((a, b) => a - b);
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

const RESULTS_PER_PAGE = 24; // typical for all three marketplaces
const HARD_MAX_RESULTS = 50;
const DEFAULT_MAX_RESULTS = 20;

function parsePageResults(
  marketplace: PriceTrackInput["marketplace"],
  html: string,
  pageNumber: number
) {
  switch (marketplace) {
    case "trendyol":    return parseTrendyolResults(html, pageNumber);
    case "hepsiburada": return parseHepsiburadaResults(html, pageNumber);
    case "n11":         return parseN11Results(html, pageNumber);
  }
}

/**
 * Scrape competitor prices for a keyword.
 *
 * Pages are fetched until `maxResults` are collected or there are no more
 * results. Never throws — returns a safe error result on failure.
 */
export async function trackCompetitorPrices(
  input: PriceTrackInput,
  page?: ScraperPage
): Promise<PriceTrackResult> {
  const { marketplace, keyword } = input;
  const maxResults = Math.min(input.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS);
  const scrapedAt = new Date().toISOString();

  const emptyStats = { min: 0, max: 0, median: 0, p25: 0, p75: 0 };

  if (!page) {
    return {
      keyword,
      marketplace,
      prices: [],
      stats: emptyStats,
      scrapedAt,
      error: "No browser page provided — call with a ScraperPage instance.",
    };
  }

  const collected: CompetitorPrice[] = [];
  const maxPages = Math.ceil(maxResults / RESULTS_PER_PAGE);
  let globalRank = 0;

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (collected.length >= maxResults) break;

      const url = buildSearchUrl(marketplace, keyword, pageNum);

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (navErr) {
        return {
          keyword,
          marketplace,
          prices: collected,
          stats: computePriceStats(collected.map((c) => c.price)),
          scrapedAt,
          error: `Navigation failed on page ${pageNum}: ${String(navErr)}`,
        };
      }

      const html = await page.content();
      const pageResults = parsePageResults(marketplace, html, pageNum);

      for (const result of pageResults) {
        if (collected.length >= maxResults) break;
        globalRank++;
        collected.push({
          title: result.title,
          price: result.price,
          currency: "TRY",
          rank: globalRank,
        });
      }

      // If a page returned no results, stop (end of search results)
      if (pageResults.length === 0) break;
    }

    const priceValues = collected.map((c) => c.price);
    return {
      keyword,
      marketplace,
      prices: collected,
      stats: computePriceStats(priceValues),
      scrapedAt,
    };
  } catch (err) {
    return {
      keyword,
      marketplace,
      prices: collected,
      stats: computePriceStats(collected.map((c) => c.price)),
      scrapedAt,
      error: `Scraping error: ${String(err)}`,
    };
  }
}
