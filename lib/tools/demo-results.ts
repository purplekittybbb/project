/**
 * Deterministic preview results when live scraping is unavailable (no Playwright).
 * Clearly labeled with mode: "preview" in API responses.
 */

import type { ParsedToolQuery } from "./parse-query";
import type { StandaloneToolId } from "./registry";

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function buildPreviewResult(toolId: StandaloneToolId, input: ParsedToolQuery): unknown {
  const seed = seedFromString(`${toolId}:${input.marketplace}:${input.keyword}`);
  const baseRank = (seed % 47) + 1;
  const now = new Date().toISOString();

  switch (toolId) {
    case "visibility":
      return {
        mode: "preview",
        found: baseRank <= 40,
        rank: baseRank <= 40 ? baseRank : undefined,
        page: Math.ceil(baseRank / 24),
        isIndexed: baseRank <= 80,
        isOnFirstPage: baseRank <= 24,
        keyword: input.keyword,
        targetTitle: input.targetTitle,
        marketplace: input.marketplace,
        checkedAt: now,
        note: "Canlı tarama için sunucuda tarayıcı oturumu gerekir. Bu önizleme deterministiktir.",
      };

    case "index-check":
      return {
        mode: "preview",
        isIndexed: baseRank <= 72,
        isOnFirstPage: baseRank <= 24,
        rank: baseRank <= 72 ? baseRank : undefined,
        status: baseRank <= 24 ? "first_page" : baseRank <= 72 ? "deep_page" : "not_indexed",
        keyword: input.keyword,
        targetTitle: input.targetTitle,
        marketplace: input.marketplace,
        checkedAt: now,
        note: "Canlı tarama için sunucuda tarayıcı oturumu gerekir. Bu önizleme deterministiktir.",
      };

    case "price-track": {
      const base = 400 + (seed % 900);
      const prices = [0, 1, 2, 3, 4].map((i) => ({
        title: `${input.keyword} — Rakip ${i + 1}`,
        price: Math.round(base * (0.85 + i * 0.08)),
        currency: "TRY",
        rank: i + 1,
      }));
      const nums = prices.map((p) => p.price);
      nums.sort((a, b) => a - b);
      return {
        mode: "preview",
        keyword: input.keyword,
        marketplace: input.marketplace,
        prices,
        stats: {
          min: nums[0],
          max: nums[nums.length - 1],
          median: nums[Math.floor(nums.length / 2)],
          p25: nums[1],
          p75: nums[3],
        },
        scrapedAt: now,
        note: "Canlı tarama için sunucuda tarayıcı oturumu gerekir. Bu önizleme deterministiktir.",
      };
    }

    case "top100": {
      const items = Array.from({ length: 10 }, (_, i) => {
        const price = 300 + ((seed + i * 17) % 1200);
        return {
          rank: i + 1,
          title: `${input.keyword} varyant ${i + 1}`,
          price,
          currency: "TRY",
          demandEstimate: {
            rangeLow: 0,
            rangeHigh: 800 + (seed % 400),
            confidenceScore: 20,
          },
        };
      });
      const priceList = items.map((x) => x.price).sort((a, b) => a - b);
      return {
        mode: "preview",
        keyword: input.keyword,
        marketplace: input.marketplace,
        items,
        priceStats: {
          min: priceList[0],
          max: priceList[priceList.length - 1],
          p25: priceList[2],
          p50: priceList[4],
          p75: priceList[7],
        },
        aggregateConfidence: 20,
        isPartial: true,
        analysedAt: now,
        note: "Canlı tarama için sunucuda tarayıcı oturumu gerekir. Önizleme ilk 10 sonuç gösterir.",
      };
    }
  }
}
