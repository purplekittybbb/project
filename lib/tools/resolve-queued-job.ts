/**
 * Resolve a BullMQ scrape job into a ToolRunEnvelope for the poll endpoint.
 * Completed jobs are served from shared_* cache tables (written by the worker).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getScrapeJobStatus, type ScrapeJobPayload } from "@/lib/queue";
import { hasUsablePrices } from "@/lib/scrapers/price-tracker";
import {
  loadSharedPriceTrackScan,
  loadSharedTop100Scan,
} from "@/lib/supabase/shared-scraper-cache";
import { loadSharedVisibilityScan } from "@/lib/supabase/shared-visibility";
import type { ToolRunEnvelope } from "@/lib/tools/run-standalone";
import type { StandaloneToolId } from "@/lib/tools/registry";
import type { ToolMarketplace } from "@/lib/tools/parse-query";

type ScraperToolId = Exclude<StandaloneToolId, "profit-calc">;

const QUEUE_POLL_MESSAGE =
  "Sonucun hazırlanıyor… Pazaryeri taranıyor; birkaç saniye içinde güncellenecek.";

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asMarketplace(value: string): ToolMarketplace {
  if (value === "hepsiburada" || value === "n11" || value === "trendyol") return value;
  return "trendyol";
}

function queuedEnvelope(toolId: ScraperToolId, jobId: string, retryAfterSeconds = 3): ToolRunEnvelope {
  return {
    toolId,
    mode: "queued",
    data: {
      message: QUEUE_POLL_MESSAGE,
      retryAfterSeconds,
      jobId,
    },
  };
}

function failedEnvelope(toolId: ScraperToolId, message: string): ToolRunEnvelope {
  return {
    toolId,
    mode: "live",
    data: {
      error: message,
    },
  };
}

async function loadCachedResult(
  toolId: ScraperToolId,
  payload: ScrapeJobPayload,
): Promise<ToolRunEnvelope | null> {
  const anon = anonClient();
  if (!anon) return null;

  const marketplace = asMarketplace(payload.marketplace);
  const keyword = payload.keyword;
  const targetTitle = payload.targetTitle?.trim() || keyword;

  if (toolId === "visibility" || toolId === "index-check") {
    const cached = await loadSharedVisibilityScan(anon, marketplace, keyword, undefined);
    if (!cached) return null;
    if (toolId === "visibility") {
      return {
        toolId,
        mode: "cached",
        data: {
          found: cached.rank != null,
          rank: cached.rank ?? undefined,
          page: cached.page ?? undefined,
          isIndexed: cached.isIndexed,
          isOnFirstPage: cached.isOnFirstPage,
          searchResultCount: cached.searchResultCount,
          results: [],
          scrapedAt: cached.scrapedAt,
          keyword,
          targetTitle,
          marketplace,
        },
      };
    }
    return {
      toolId,
      mode: "cached",
      data: {
        isIndexed: cached.isIndexed,
        isOnFirstPage: cached.isOnFirstPage,
        rank: cached.rank ?? undefined,
        status: !cached.isIndexed ? "not_indexed" : cached.isOnFirstPage ? "first_page" : "deep_page",
        scrapedAt: cached.scrapedAt,
        keyword,
        targetTitle,
        marketplace,
      },
    };
  }

  if (toolId === "price-track") {
    const cached = await loadSharedPriceTrackScan(anon, marketplace, keyword);
    if (!cached || !hasUsablePrices(cached.result)) return null;
    return { toolId, mode: "cached", data: cached.result };
  }

  if (toolId === "top100") {
    const cached = await loadSharedTop100Scan(anon, marketplace, keyword);
    const items = cached?.result?.items ?? [];
    if (!cached || !items.some((item) => item.price > 0)) return null;
    return { toolId, mode: "cached", data: cached.result };
  }

  return null;
}

/**
 * Poll status for an enqueued scrape. Safe for Vercel handlers (no browser).
 */
export async function resolveQueuedScrapeJob(
  toolId: ScraperToolId,
  jobId: string,
): Promise<
  | { status: "ok"; envelope: ToolRunEnvelope; shouldRefund: boolean }
  | { status: "error"; error: string; httpStatus: number; shouldRefund: boolean }
> {
  const status = await getScrapeJobStatus(jobId);

  if (!status.ok) {
    if (status.reason === "redis_unavailable") {
      return {
        status: "error",
        error: "Kuyruk şu an kullanılamıyor. Birazdan tekrar deneyin.",
        httpStatus: 503,
        shouldRefund: true,
      };
    }
    return {
      status: "error",
      error: "İş bulunamadı. Lütfen sorguyu yeniden gönderin.",
      httpStatus: 404,
      shouldRefund: true,
    };
  }

  if (status.payload.toolId !== toolId) {
    return {
      status: "error",
      error: "İş bu araçla eşleşmiyor.",
      httpStatus: 400,
      shouldRefund: false,
    };
  }

  if (status.state === "failed") {
    return {
      status: "ok",
      envelope: failedEnvelope(
        toolId,
        "Şu an tarayamadık. Birazdan tekrar deneyin.",
      ),
      shouldRefund: true,
    };
  }

  if (status.state === "completed") {
    const cached = await loadCachedResult(toolId, status.payload);
    if (cached) {
      return { status: "ok", envelope: cached, shouldRefund: false };
    }
    // Worker finished but cache not visible yet — brief grace poll.
    const finishedAgeMs = status.finishedOn ? Date.now() - status.finishedOn : 0;
    if (finishedAgeMs > 15_000) {
      return {
        status: "ok",
        envelope: failedEnvelope(toolId, "Şu an tarayamadık. Birazdan tekrar deneyin."),
        shouldRefund: true,
      };
    }
    return {
      status: "ok",
      envelope: queuedEnvelope(toolId, jobId, 2),
      shouldRefund: false,
    };
  }

  return {
    status: "ok",
    envelope: queuedEnvelope(toolId, jobId, 3),
    shouldRefund: false,
  };
}
