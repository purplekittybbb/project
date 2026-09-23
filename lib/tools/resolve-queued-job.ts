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
import type { RateLimitSubject } from "@/lib/tools/guest-rate-limit";

type ScraperToolId = Exclude<StandaloneToolId, "profit-calc">;

const QUEUE_POLL_MESSAGE =
  "Sonucun hazırlanıyor… Pazaryeri taranıyor; birkaç saniye içinde güncellenecek.";

export type ResolveQueuedResult =
  | {
      status: "ok";
      envelope: ToolRunEnvelope;
      shouldRefund: boolean;
      refundSubject: RateLimitSubject | null;
    }
  | {
      status: "error";
      error: string;
      httpStatus: number;
      shouldRefund: boolean;
      refundSubject: RateLimitSubject | null;
    };

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asMarketplace(value: string): ToolMarketplace | null {
  if (value === "hepsiburada" || value === "n11" || value === "trendyol") return value;
  return null;
}

function subjectFromPayload(payload: ScrapeJobPayload): RateLimitSubject | null {
  if (payload.quotaSubjectType && payload.quotaSubjectKey) {
    return { type: payload.quotaSubjectType, key: payload.quotaSubjectKey };
  }
  return null;
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

function failedEnvelope(toolId: ScraperToolId, message: string, payload?: ScrapeJobPayload): ToolRunEnvelope {
  return {
    toolId,
    mode: "live",
    data: {
      error: message,
      ...(payload
        ? {
            keyword: payload.keyword,
            targetTitle: payload.targetTitle ?? payload.keyword,
            marketplace: payload.marketplace,
          }
        : {}),
    },
  };
}

async function loadCachedResult(
  toolId: ScraperToolId,
  payload: ScrapeJobPayload,
  finishedOn: number | null,
): Promise<ToolRunEnvelope | null> {
  const anon = anonClient();
  if (!anon) return null;

  const marketplace = asMarketplace(payload.marketplace);
  if (!marketplace) return null;

  const keyword = payload.keyword;
  const targetTitle = payload.targetTitle?.trim() || keyword;
  // Reject cache older than job finish (stale pre-existing row must not count as this job's result).
  const minScrapedMs = finishedOn ? finishedOn - 5_000 : 0;

  if (toolId === "visibility" || toolId === "index-check") {
    const cached = await loadSharedVisibilityScan(anon, marketplace, keyword, undefined);
    if (!cached) return null;
    if (minScrapedMs > 0 && new Date(cached.scrapedAt).getTime() < minScrapedMs) return null;
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
    if (minScrapedMs > 0 && new Date(cached.scrapedAt).getTime() < minScrapedMs) return null;
    return { toolId, mode: "cached", data: cached.result };
  }

  if (toolId === "top100") {
    const cached = await loadSharedTop100Scan(anon, marketplace, keyword);
    const items = cached?.result?.items ?? [];
    if (!cached || !items.some((item) => item.price > 0)) return null;
    if (minScrapedMs > 0 && new Date(cached.scrapedAt).getTime() < minScrapedMs) return null;
    return { toolId, mode: "cached", data: cached.result };
  }

  return null;
}

/**
 * Poll status for an enqueued scrape. Safe for Vercel handlers (no browser).
 * @param abandon — client gave up (poll timeout); refund if job still unfinished/failed.
 */
export async function resolveQueuedScrapeJob(
  toolId: ScraperToolId,
  jobId: string,
  opts?: { abandon?: boolean },
): Promise<ResolveQueuedResult> {
  const status = await getScrapeJobStatus(jobId);

  if (!status.ok) {
    if (status.reason === "redis_unavailable") {
      return {
        status: "error",
        error: "Kuyruk şu an kullanılamıyor. Birazdan tekrar deneyin.",
        httpStatus: 503,
        // Don't refund without a job — we can't prove a charge; abandon path uses POST refund separately.
        shouldRefund: Boolean(opts?.abandon),
        refundSubject: null,
      };
    }
    // Job evicted after completion — do NOT refund (user may have already seen the result).
    return {
      status: "error",
      error: "İş bulunamadı. Lütfen sorguyu yeniden gönderin.",
      httpStatus: 404,
      shouldRefund: false,
      refundSubject: null,
    };
  }

  const refundSubject = subjectFromPayload(status.payload);

  if (status.payload.toolId !== toolId) {
    return {
      status: "error",
      error: "İş bu araçla eşleşmiyor.",
      httpStatus: 400,
      shouldRefund: false,
      refundSubject,
    };
  }

  if (!asMarketplace(status.payload.marketplace)) {
    return {
      status: "ok",
      envelope: failedEnvelope(toolId, "Şu an tarayamadık. Birazdan tekrar deneyin.", status.payload),
      shouldRefund: true,
      refundSubject,
    };
  }

  if (status.state === "failed") {
    return {
      status: "ok",
      envelope: failedEnvelope(toolId, "Şu an tarayamadık. Birazdan tekrar deneyin.", status.payload),
      shouldRefund: true,
      refundSubject,
    };
  }

  if (opts?.abandon && status.state !== "completed") {
    return {
      status: "ok",
      envelope: failedEnvelope(
        toolId,
        "Tarama beklenenden uzun sürdü. Birazdan tekrar deneyin.",
        status.payload,
      ),
      shouldRefund: true,
      refundSubject,
    };
  }

  if (status.state === "completed") {
    const cached = await loadCachedResult(toolId, status.payload, status.finishedOn);
    if (cached) {
      return { status: "ok", envelope: cached, shouldRefund: false, refundSubject };
    }
    const finishedAgeMs = status.finishedOn ? Date.now() - status.finishedOn : 0;
    if (finishedAgeMs > 15_000 || opts?.abandon) {
      return {
        status: "ok",
        envelope: failedEnvelope(toolId, "Şu an tarayamadık. Birazdan tekrar deneyin.", status.payload),
        shouldRefund: true,
        refundSubject,
      };
    }
    return {
      status: "ok",
      envelope: queuedEnvelope(toolId, jobId, 2),
      shouldRefund: false,
      refundSubject,
    };
  }

  return {
    status: "ok",
    envelope: queuedEnvelope(toolId, jobId, 3),
    shouldRefund: false,
    refundSubject,
  };
}
