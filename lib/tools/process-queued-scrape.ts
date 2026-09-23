/**
 * Execute a scrape job enqueued by the API (BullMQ worker path).
 * Writes successful results into the shared Supabase cache tables.
 */

import { analyzeTop100 } from "@/lib/demand/top100";
import type { ScrapeJobPayload } from "@/lib/queue";
import { createBrowserSession } from "@/lib/scrapers/browser";
import { shouldCachePriceTrackResult, trackCompetitorPrices } from "@/lib/scrapers/price-tracker";
import { checkIndex, searchProductRank } from "@/lib/scrapers/visibility";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  upsertSharedPriceTrackScan,
  upsertSharedTop100Scan,
} from "@/lib/supabase/shared-scraper-cache";
import { upsertSharedVisibilityScan } from "@/lib/supabase/shared-visibility";
import type { ToolMarketplace } from "@/lib/tools/parse-query";

function asMarketplace(value: string): ToolMarketplace {
  if (value === "hepsiburada" || value === "n11" || value === "trendyol") return value;
  return "trendyol";
}

/**
 * Run the browser scrape for a queued job. Throws when the scrape is unusable
 * so BullMQ applies exponential backoff (2s → 4s → 8s).
 */
export async function processQueuedScrape(payload: ScrapeJobPayload): Promise<void> {
  const marketplace = asMarketplace(payload.marketplace);
  const keyword = payload.keyword;
  const targetTitle = payload.targetTitle?.trim() || keyword;

  const session = await createBrowserSession();
  if (!session?.page) {
    throw new Error("Browser session unavailable");
  }

  const svc = createServiceRoleClient();

  try {
    switch (payload.toolId) {
      case "visibility": {
        const data = await searchProductRank(
          { marketplace, keyword, targetTitle, maxPages: 3 },
          session.page,
        );
        if (data.error) throw new Error(data.error);
        if (svc) {
          await upsertSharedVisibilityScan(svc, {
            marketplace,
            keyword,
            sku: null,
            rank: data.rank ?? null,
            page: data.page ?? null,
            isIndexed: data.isIndexed,
            isOnFirstPage: data.isOnFirstPage,
            searchResultCount: data.results.length,
          });
        }
        break;
      }
      case "index-check": {
        const data = await checkIndex(
          { marketplace, keyword, targetTitle, maxPages: 3 },
          session.page,
        );
        if (data.error) throw new Error(data.error);
        if (svc) {
          await upsertSharedVisibilityScan(svc, {
            marketplace,
            keyword,
            sku: null,
            rank: data.rank ?? null,
            page: null,
            isIndexed: data.isIndexed,
            isOnFirstPage: data.isOnFirstPage,
          });
        }
        break;
      }
      case "price-track": {
        const data = await trackCompetitorPrices(
          { marketplace, keyword, maxResults: 20 },
          session.page,
        );
        if (!shouldCachePriceTrackResult(data)) {
          throw new Error(data.error ?? "Sonuç bulunamadı veya bot engeline takıldı");
        }
        if (svc) {
          await upsertSharedPriceTrackScan(svc, marketplace, keyword, data);
        }
        break;
      }
      case "top100": {
        const data = await analyzeTop100(
          { marketplace, keyword, maxItems: 100 },
          session.page,
        );
        if (data.error || !data.items.some((item) => item.price > 0)) {
          throw new Error(data.error ?? "Sonuç bulunamadı veya bot engeline takıldı");
        }
        if (svc) {
          await upsertSharedTop100Scan(svc, marketplace, keyword, data);
        }
        break;
      }
      default: {
        const _exhaustive: never = payload.toolId;
        throw new Error(`Unknown scrape tool: ${_exhaustive}`);
      }
    }
  } finally {
    await session.close().catch(() => {
      /* ignore */
    });
  }
}
