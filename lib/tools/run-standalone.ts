/**
 * Execute a standalone tool — live scrape when browser available, else preview.
 */

import { analyzeTop100 } from "@/lib/demand/top100";
import { createBrowserSession } from "@/lib/scrapers/browser";
import { trackCompetitorPrices } from "@/lib/scrapers/price-tracker";
import { checkIndex, searchProductRank } from "@/lib/scrapers/visibility";
import { buildPreviewResult } from "./demo-results";
import type { ParsedToolQuery } from "./parse-query";
import type { StandaloneToolId } from "./registry";

type ScraperToolId = Exclude<StandaloneToolId, "profit-calc">;

export interface ToolRunEnvelope {
  toolId: ScraperToolId;
  mode: "live" | "preview";
  data: unknown;
}

export async function runStandaloneTool(
  toolId: ScraperToolId,
  input: ParsedToolQuery,
): Promise<ToolRunEnvelope> {
  const session = await createBrowserSession();
  const page = session?.page;

  try {
    if (!page) {
      return {
        toolId,
        mode: "preview",
        data: buildPreviewResult(toolId, input),
      };
    }

    switch (toolId) {
      case "visibility": {
        const data = await searchProductRank(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            maxPages: 3,
          },
          page,
        );
        return { toolId, mode: "live", data };
      }
      case "index-check": {
        const data = await checkIndex(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            targetTitle: input.targetTitle,
            maxPages: 3,
          },
          page,
        );
        return { toolId, mode: "live", data };
      }
      case "price-track": {
        const data = await trackCompetitorPrices(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            maxResults: 20,
          },
          page,
        );
        return { toolId, mode: "live", data };
      }
      case "top100": {
        const data = await analyzeTop100(
          {
            marketplace: input.marketplace,
            keyword: input.keyword,
            maxItems: 100,
          },
          page,
        );
        return { toolId, mode: "live", data };
      }
      default: {
        const _exhaustive: never = toolId;
        return {
          toolId: _exhaustive,
          mode: "preview",
          data: buildPreviewResult(toolId, input),
        };
      }
    }
  } finally {
    await session?.close();
  }
}
