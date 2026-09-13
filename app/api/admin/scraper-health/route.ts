import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRecentPrecrawlRuns } from "@/lib/supabase/precrawl-log";
import { maxConcurrentScrapes } from "@/lib/supabase/scan-concurrency";
import { PRICE_TRACK_TTL_MS, TOP100_TTL_MS, VISIBILITY_TTL_MS } from "@/lib/tools/cache-ttl";

/**
 * GET /api/admin/scraper-health
 *
 * A single authenticated snapshot of the whole guest-tool scraper
 * infrastructure — the cache, the concurrency queue, and the pre-crawl
 * worker — so its health is one request away instead of grep-ing raw
 * Vercel function logs. Built as an internal JSON endpoint (same
 * CRON_SECRET pattern as every cron in this codebase) rather than a UI page:
 * this project has no admin-auth system, and bolting one on quickly for a
 * one-person dashboard would be a bigger, riskier change than the
 * observability it buys. Open the URL with an Authorization header (or curl
 * it) to read it.
 *
 * Reports, all read-only, nothing here writes:
 *   - queue: current scrape_leases rows per marketplace, split into
 *     active (within the lease TTL) vs stale (should self-clear on the
 *     next acquire — a persistently high stale count would mean something
 *     is wrong with the sweep, not with load).
 *   - cache: row count + fresh-vs-stale split for each of the 3 shared
 *     cache tables, using the SAME TTLs run-standalone.ts reads by
 *     (lib/tools/cache-ttl.ts) — "fresh" here means exactly what a visitor
 *     would experience as a cache hit right now.
 *   - topKeywords: the 10 most-searched keywords per tool bucket
 *     (keyword_search_stats) — what the pre-crawl worker is prioritizing.
 *   - recentRuns: the last 10 pre-crawl cron runs (migration 0032).
 */

export const runtime = "nodejs";

const LEASE_TTL_SECONDS = 180; // Mirrors DEFAULT_LEASE_TTL_SECONDS in lib/supabase/scan-concurrency.ts.
const MARKETPLACES = ["trendyol", "hepsiburada", "n11"] as const;
const TOOL_BUCKETS = ["visibility", "price-track", "top100"] as const;

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function cacheTableStats(supabase: SupabaseClient, table: string, ttlMs: number) {
  const cutoff = new Date(Date.now() - ttlMs).toISOString();

  const [{ count: total, error: totalError }, { count: fresh, error: freshError }] = await Promise.all([
    supabase.from(table).select("*", { count: "exact", head: true }),
    supabase.from(table).select("*", { count: "exact", head: true }).gte("scraped_at", cutoff),
  ]);

  if (totalError) return { total: 0, fresh: 0, stale: 0, error: totalError.message };
  const t = total ?? 0;
  const f = freshError ? 0 : (fresh ?? 0);
  return { total: t, fresh: f, stale: Math.max(0, t - f) };
}

async function queueStats(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("scrape_leases").select("marketplace, started_at");
  if (error || !data) {
    return Object.fromEntries(MARKETPLACES.map((m) => [m, { active: 0, stale: 0 }]));
  }

  const cutoffMs = Date.now() - LEASE_TTL_SECONDS * 1000;
  const byMarketplace: Record<string, { active: number; stale: number }> = Object.fromEntries(
    MARKETPLACES.map((m) => [m, { active: 0, stale: 0 }]),
  );

  for (const row of data as Array<{ marketplace: string; started_at: string }>) {
    const bucket = byMarketplace[row.marketplace] ?? (byMarketplace[row.marketplace] = { active: 0, stale: 0 });
    const startedMs = new Date(row.started_at).getTime();
    if (!Number.isNaN(startedMs) && startedMs > cutoffMs) bucket.active++;
    else bucket.stale++;
  }

  return byMarketplace;
}

async function topKeywords(supabase: SupabaseClient, toolId: string, limit: number) {
  const { data, error } = await supabase
    .from("keyword_search_stats")
    .select("marketplace, keyword, search_count, last_searched_at")
    .eq("tool_id", toolId)
    .order("search_count", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    marketplace: String(r.marketplace),
    keyword: String(r.keyword),
    searchCount: Number(r.search_count ?? 0),
    lastSearchedAt: String(r.last_searched_at),
  }));
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  const [queue, visibilityCache, priceTrackCache, top100Cache, recentRuns, topKeywordsByTool] = await Promise.all([
    queueStats(supabase),
    cacheTableStats(supabase, "shared_visibility_scans", VISIBILITY_TTL_MS),
    cacheTableStats(supabase, "shared_price_track_scans", PRICE_TRACK_TTL_MS),
    cacheTableStats(supabase, "shared_top100_scans", TOP100_TTL_MS),
    loadRecentPrecrawlRuns(supabase, 10),
    Promise.all(TOOL_BUCKETS.map((t) => topKeywords(supabase, t, 10))),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    concurrency: {
      maxPerMarketplace: maxConcurrentScrapes(),
      queue, // { trendyol: { active, stale }, ... } — "active" ≈ in-flight scrapes right now.
    },
    cache: {
      visibility: visibilityCache,
      "price-track": priceTrackCache,
      top100: top100Cache,
    },
    topKeywords: Object.fromEntries(TOOL_BUCKETS.map((t, i) => [t, topKeywordsByTool[i]])),
    recentPrecrawlRuns: recentRuns,
  });
}
