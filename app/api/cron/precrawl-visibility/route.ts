import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeTop100 } from "@/lib/demand/top100";
import { createBrowserSession, type ScraperPage } from "@/lib/scrapers/browser";
import { trackCompetitorPrices } from "@/lib/scrapers/price-tracker";
import { searchProductRank } from "@/lib/scrapers/visibility";
import { loadPrecrawlCandidates, type PrecrawlCandidate, type PrecrawlToolId } from "@/lib/supabase/keyword-stats";
import { acquireScrapeSlot, maxConcurrentScrapes, releaseScrapeSlot } from "@/lib/supabase/scan-concurrency";
import { upsertSharedPriceTrackScan, upsertSharedTop100Scan } from "@/lib/supabase/shared-scraper-cache";
import { upsertSharedVisibilityScan } from "@/lib/supabase/shared-visibility";

/**
 * GET /api/cron/precrawl-visibility
 *
 * The "veri toplama motoru" (background data-collection engine) half of the
 * guest-tool architecture, covering all three cacheable scraper tools:
 * visibility (+ index-check, same cache row), price-track, top100. The
 * shared_*_scans tables (0027, 0031) + run-standalone.ts already serve
 * cached results instantly; this cron is what keeps that cache warm
 * PROACTIVELY, so the common case is "already there" instead of "someone
 * has to be the unlucky first visitor who eats a live scrape."
 *
 * Each run, for EACH of the 3 tool buckets: look at keyword_search_stats
 * (0030) — real guest search demand — pick the most-searched (marketplace,
 * keyword) pairs whose cached result is missing or stale, and refresh a
 * small batch. Nothing here is guessed; it only ever refreshes keywords
 * guests actually typed. (Route path kept as "precrawl-visibility" to avoid
 * an orphaned duplicate file/cron entry — it now covers all 3 tools.)
 *
 * ── Security ────────────────────────────────────────────────────────────
 * Same CRON_SECRET pattern as sync-marketplaces — Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when it invokes this
 * route on schedule (see vercel.json).
 *
 * ── Rate limit guard ────────────────────────────────────────────────────
 * At most PRECRAWL_BATCH_SIZE (default 2, max 4) keywords PER TOOL bucket
 * per invocation (so ≤12 scans total across all 3 tools), one at a time
 * (never Promise.all), with a delay between each scan. Every scan also goes
 * through the SAME cross-instance concurrency lease
 * (lib/supabase/scan-concurrency.ts, migration 0029) that guest live
 * requests use — this worker shares the marketplace-wide cap, it does not
 * get a separate budget. If live guest traffic is already using every slot,
 * this run simply skips that keyword's turn rather than adding load.
 *
 * ── Graceful degradation ────────────────────────────────────────────────
 * Same as every other scraper cron in this codebase: if a browser session
 * can't be created (Playwright unavailable) or the migrations aren't
 * applied yet, this returns a normal 200 with zero scanned rather than
 * failing the cron (soft-fail, not an alert-worthy error).
 *
 * ── vercel.json cron ────────────────────────────────────────────────────
 * Runs every 20 minutes: "*\/20 * * * *". Not active until this file is
 * deployed AND migrations 0029, 0030, 0031 are applied in Supabase.
 */

export const runtime = "nodejs";
export const maxDuration = 280;

const SCAN_DELAY_MS = 4_000;
const DEFAULT_BATCH_SIZE_PER_TOOL = 2;
const MAX_BATCH_SIZE_PER_TOOL = 4;
const CANDIDATE_POOL_SIZE = 40;

/** Mirrors the read-side TTLs in lib/tools/run-standalone.ts — refresh
 *  BEFORE the cache actually goes stale for a visitor, not after. */
const STALE_AFTER_MS: Record<PrecrawlToolId, number> = {
  visibility: 3 * 60 * 60 * 1000, // half of the 6h visibility TTL
  "price-track": 1.5 * 60 * 60 * 1000, // half of the 3h price-track TTL
  top100: 3 * 60 * 60 * 1000, // half of the 6h top100 TTL
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface RunSummary {
  scanned: number;
  refreshed: number;
  skippedBusy: number;
  errors: string[];
}

/** One tool bucket's refresh pass — isolated so one tool's failure never blocks the others. */
async function precrawlTool(
  toolId: PrecrawlToolId,
  supabase: SupabaseClient,
  page: ScraperPage,
  batchSize: number,
  freshTable: string,
  freshFilter: Record<string, string> | undefined,
  writeResult: (candidate: PrecrawlCandidate, page: ScraperPage) => Promise<{ ok: boolean; error?: string }>,
): Promise<RunSummary> {
  const summary: RunSummary = { scanned: 0, refreshed: 0, skippedBusy: 0, errors: [] };

  const candidates = await loadPrecrawlCandidates(supabase, {
    toolId,
    freshTable,
    freshFilter,
    staleAfterMs: STALE_AFTER_MS[toolId],
    poolSize: CANDIDATE_POOL_SIZE,
    limit: batchSize,
  });

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Share the marketplace-wide cap with live guest traffic (0029) — this
    // worker never competes for a slot at the expense of a real visitor.
    const slot = await acquireScrapeSlot(supabase, candidate.marketplace);
    if (!slot.acquired) {
      summary.skippedBusy++;
      console.log(
        `[cron/precrawl-visibility] [${toolId}] Skipped ${candidate.marketplace}/"${candidate.keyword}" — all ${maxConcurrentScrapes()} slot(s) busy.`,
      );
      continue;
    }

    try {
      summary.scanned++;
      const result = await writeResult(candidate, page);
      if (result.ok) {
        summary.refreshed++;
        console.log(
          `[cron/precrawl-visibility] [${toolId}] Refreshed ${candidate.marketplace}/"${candidate.keyword}" (searched ${candidate.searchCount}x).`,
        );
      } else {
        summary.errors.push(`[${toolId}] ${candidate.marketplace}/"${candidate.keyword}": ${result.error ?? "unknown error"}`);
      }
    } catch (err) {
      summary.errors.push(`[${toolId}] Error scanning ${candidate.marketplace}/"${candidate.keyword}": ${String(err)}`);
    } finally {
      await releaseScrapeSlot(supabase, slot.leaseId);
    }

    if (i < candidates.length - 1) {
      await delay(SCAN_DELAY_MS);
    }
  }

  return summary;
}

function mergeSummaries(a: RunSummary, b: RunSummary): RunSummary {
  return {
    scanned: a.scanned + b.scanned,
    refreshed: a.refreshed + b.refreshed,
    skippedBusy: a.skippedBusy + b.skippedBusy,
    errors: [...a.errors, ...b.errors],
  };
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[cron/precrawl-visibility] Supabase service role not configured.");
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  const batchSize = Math.min(
    Number(process.env.PRECRAWL_BATCH_SIZE) || DEFAULT_BATCH_SIZE_PER_TOOL,
    MAX_BATCH_SIZE_PER_TOOL,
  );

  const session = await createBrowserSession();
  if (!session) {
    console.warn("[cron/precrawl-visibility] Browser session unavailable — Playwright not installed or failed to start.");
    return NextResponse.json({ scanned: 0, refreshed: 0, skippedBusy: 0, errors: ["Browser session unavailable"] });
  }

  let total: RunSummary = { scanned: 0, refreshed: 0, skippedBusy: 0, errors: [] };

  try {
    const visibilitySummary = await precrawlTool(
      "visibility",
      supabase,
      session.page,
      batchSize,
      "shared_visibility_scans",
      { sku: "" },
      async (candidate, page) => {
        const result = await searchProductRank(
          {
            marketplace: candidate.marketplace as "trendyol" | "hepsiburada" | "n11",
            keyword: candidate.keyword,
            targetTitle: candidate.keyword,
            maxPages: 3,
          },
          page,
        );
        const shared = await upsertSharedVisibilityScan(supabase, {
          marketplace: candidate.marketplace,
          keyword: candidate.keyword,
          sku: null,
          rank: result.rank ?? null,
          page: result.page ?? null,
          isIndexed: result.isIndexed,
          isOnFirstPage: result.isOnFirstPage,
          searchResultCount: result.results.length,
        });
        return { ok: !shared.error, error: shared.error ?? undefined };
      },
    );
    total = mergeSummaries(total, visibilitySummary);

    const priceTrackSummary = await precrawlTool(
      "price-track",
      supabase,
      session.page,
      batchSize,
      "shared_price_track_scans",
      undefined,
      async (candidate, page) => {
        const result = await trackCompetitorPrices(
          { marketplace: candidate.marketplace as "trendyol" | "hepsiburada" | "n11", keyword: candidate.keyword, maxResults: 20 },
          page,
        );
        if (result.error) return { ok: false, error: result.error };
        const { error } = await upsertSharedPriceTrackScan(supabase, candidate.marketplace, candidate.keyword, result);
        return { ok: !error, error: error ?? undefined };
      },
    );
    total = mergeSummaries(total, priceTrackSummary);

    const top100Summary = await precrawlTool(
      "top100",
      supabase,
      session.page,
      batchSize,
      "shared_top100_scans",
      undefined,
      async (candidate, page) => {
        const result = await analyzeTop100(
          { marketplace: candidate.marketplace as "trendyol" | "hepsiburada" | "n11", keyword: candidate.keyword, maxItems: 100 },
          page,
        );
        if (result.error) return { ok: false, error: result.error };
        const { error } = await upsertSharedTop100Scan(supabase, candidate.marketplace, candidate.keyword, result);
        return { ok: !error, error: error ?? undefined };
      },
    );
    total = mergeSummaries(total, top100Summary);
  } finally {
    await session.close().catch(() => { /* ignore close errors */ });
  }

  console.log(
    `[cron/precrawl-visibility] Done: scanned=${total.scanned}, refreshed=${total.refreshed}, skipped-busy=${total.skippedBusy}, errors=${total.errors.length}`,
  );
  return NextResponse.json(total);
}
