/**
 * Shared visibility scans + per-user watches (migration 0027).
 *
 * Dual-write companion to visibility_checks:
 *   - shared_visibility_scans  = public result for (marketplace, keyword, sku)
 *   - visibility_watches       = this user is tracking that key (RLS-private)
 *
 * Soft-fails if 0027 is not applied yet — cron must keep writing visibility_checks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import type {
  SharedVisibilityScan,
  VisibilityWatch,
  WatchedVisibility,
} from "../domain/visibility";

/** Empty string is the SQL sentinel for "no SKU" (unique constraint friendly). */
export function normalizeSharedSku(sku: string | null | undefined): string {
  return (sku ?? "").trim();
}

export interface SharedScanPayload {
  marketplace: string;
  keyword: string;
  sku?: string | null;
  rank: number | null;
  page: number | null;
  isIndexed: boolean;
  isOnFirstPage: boolean;
  searchResultCount?: number;
}

export async function upsertSharedVisibilityScan(
  supabase: SupabaseClient,
  payload: SharedScanPayload,
): Promise<{ scanId: string | null; error: string | null }> {
  const row = {
    marketplace: payload.marketplace,
    keyword: payload.keyword,
    sku: normalizeSharedSku(payload.sku),
    rank: payload.rank,
    page: payload.page,
    is_indexed: payload.isIndexed,
    is_on_first_page: payload.isOnFirstPage,
    search_result_count: payload.searchResultCount ?? null,
    scraped_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("shared_visibility_scans")
    .upsert(row, { onConflict: "marketplace,keyword,sku" })
    .select("id")
    .single();

  if (error || !data) {
    return { scanId: null, error: error?.message ?? "No data returned after upsert" };
  }
  return { scanId: String((data as { id: string }).id), error: null };
}

export async function loadSharedVisibilityScan(
  supabase: SupabaseClient,
  marketplace: string,
  keyword: string,
  sku?: string | null,
): Promise<SharedVisibilityScan | null> {
  const { data, error } = await supabase
    .from("shared_visibility_scans")
    .select("*")
    .eq("marketplace", marketplace)
    .eq("keyword", keyword)
    .eq("sku", normalizeSharedSku(sku))
    .maybeSingle();

  if (error || !data) return null;
  return mapShared(data as Record<string, unknown>);
}

export async function ensureVisibilityWatch(
  supabase: SupabaseClient,
  userId: string,
  opts: { tenantId: string; marketplace: string; sku?: string | null; keyword: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("visibility_watches").upsert(
    {
      user_id: userId,
      tenant_id: opts.tenantId,
      marketplace: opts.marketplace,
      sku: normalizeSharedSku(opts.sku),
      keyword: opts.keyword,
    },
    { onConflict: "user_id,marketplace,sku,keyword", ignoreDuplicates: true },
  );
  return { error: error ? error.message : null };
}

export async function loadVisibilityWatches(
  supabase: SupabaseClient,
  userId: string,
): Promise<VisibilityWatch[]> {
  const { data, error } = await supabase
    .from("visibility_watches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map(mapWatch);
}

export function sharedScanKey(marketplace: string, keyword: string, sku?: string | null): string {
  return `${marketplace}\0${keyword}\0${normalizeSharedSku(sku)}`;
}

/**
 * Phase-3 read: this user's watches + the current shared result for each key.
 * Soft-fails to watches-only (scan = null) if shared_visibility_scans is missing.
 */
export async function loadWatchedVisibility(
  supabase: SupabaseClient,
  userId: string,
  opts?: { marketplace?: string },
): Promise<WatchedVisibility[]> {
  const watches = await loadVisibilityWatches(supabase, userId);
  const filtered = opts?.marketplace
    ? watches.filter((w) => w.marketplace === opts.marketplace)
    : watches;
  if (filtered.length === 0) return [];

  const marketplaces = [...new Set(filtered.map((w) => w.marketplace))];
  const skus = [...new Set(filtered.map((w) => w.sku))];

  const { data, error } = await supabase
    .from("shared_visibility_scans")
    .select("*")
    .in("marketplace", marketplaces)
    .in("sku", skus);

  const byKey = new Map<string, SharedVisibilityScan>();
  if (!error && data) {
    for (const row of data as Array<Record<string, unknown>>) {
      const scan = mapShared(row);
      byKey.set(sharedScanKey(scan.marketplace, scan.keyword, scan.sku), scan);
    }
  }

  return filtered.map((watch) => ({
    watch,
    scan: byKey.get(sharedScanKey(watch.marketplace, watch.keyword, watch.sku)) ?? null,
  }));
}

/** Browser helper: signed-in user's watches + shared ranks. Soft-fails to []. */
export async function loadMyWatchedVisibility(
  opts?: { marketplace?: string },
): Promise<WatchedVisibility[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return [];
  return loadWatchedVisibility(supabase, userId, opts);
}

/**
 * Last-scan timestamps for the cron queue.
 * Prefers shared_visibility_scans (any tenant's scrape of that SKU).
 * Falls back to this user's visibility_checks for SKUs with no shared row.
 */
export async function loadSharedLastScans(
  supabase: SupabaseClient,
  opts: { marketplace: string; skus: string[]; userId?: string },
): Promise<Map<string, string>> {
  const lastScans = new Map<string, string>();
  const skus = opts.skus.filter((s) => s.length > 0);
  if (skus.length === 0) return lastScans;

  const { data: sharedRows, error: sharedError } = await supabase
    .from("shared_visibility_scans")
    .select("sku, scraped_at")
    .eq("marketplace", opts.marketplace)
    .in("sku", skus)
    .order("scraped_at", { ascending: false });

  if (!sharedError && sharedRows) {
    for (const row of sharedRows as Array<{ sku: string; scraped_at: string }>) {
      if (!lastScans.has(row.sku)) lastScans.set(row.sku, row.scraped_at);
    }
  }

  const missing = skus.filter((s) => !lastScans.has(s));
  if (missing.length === 0) return lastScans;

  let historyQuery = supabase
    .from("visibility_checks")
    .select("sku, checked_at")
    .eq("marketplace", opts.marketplace)
    .in("sku", missing)
    .order("checked_at", { ascending: false });
  if (opts.userId) historyQuery = historyQuery.eq("user_id", opts.userId);

  const { data: checkRows, error: checkError } = await historyQuery;
  if (!checkError && checkRows) {
    for (const row of checkRows as Array<{ sku: string; checked_at: string }>) {
      if (!lastScans.has(row.sku)) lastScans.set(row.sku, row.checked_at);
    }
  }

  return lastScans;
}

/** Newest shared scan for a SKU (any keyword). Used as the current-rank read. */
export async function loadLatestSharedScan(
  supabase: SupabaseClient,
  sku: string,
  marketplace?: string,
): Promise<SharedVisibilityScan | null> {
  const normalized = normalizeSharedSku(sku);
  if (!normalized) return null;

  let query = supabase
    .from("shared_visibility_scans")
    .select("*")
    .eq("sku", normalized)
    .order("scraped_at", { ascending: false })
    .limit(1);
  if (marketplace) query = query.eq("marketplace", marketplace);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapShared(data as Record<string, unknown>);
}

function mapShared(r: Record<string, unknown>): SharedVisibilityScan {
  return {
    id: String(r.id),
    marketplace: String(r.marketplace),
    keyword: String(r.keyword),
    sku: String(r.sku ?? ""),
    rank: r.rank != null ? Number(r.rank) : null,
    page: r.page != null ? Number(r.page) : null,
    isIndexed: Boolean(r.is_indexed),
    isOnFirstPage: Boolean(r.is_on_first_page),
    searchResultCount: r.search_result_count != null ? Number(r.search_result_count) : undefined,
    scrapedAt: String(r.scraped_at),
  };
}

function mapWatch(r: Record<string, unknown>): VisibilityWatch {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    marketplace: String(r.marketplace),
    sku: String(r.sku ?? ""),
    keyword: String(r.keyword),
    createdAt: String(r.created_at),
  };
}
