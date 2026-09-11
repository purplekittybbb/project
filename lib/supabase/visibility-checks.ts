/**
 * Visibility check persistence (Supabase table `visibility_checks`, migration 0016).
 *
 * Stores the output of lib/scrapers/visibility.ts searchProductRank() /
 * checkIndex() so visibility runs leave a durable history. Append-only
 * (no update/delete policy on the table).
 *
 * GRACEFUL DEGRADATION: tolerates the table not existing yet (0016 unapplied)
 * and a missing Supabase config — soft-fails instead of throwing.
 * RLS scopes every row to the signed-in user (auth.uid() = user_id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { loadLatestSharedScan } from "./shared-visibility";

const TABLE = "visibility_checks";

export interface StoredVisibilityCheck {
  id: string;
  userId: string;
  tenantId: string;
  marketplace: string;
  sku: string;
  keyword: string;
  rank: number | null;
  page: number | null;
  isIndexed: boolean;
  isOnFirstPage: boolean;
  searchResultCount: number | null;
  checkedAt: string;
  /** FK to shared_visibility_scans after migration 0027; null if dual-write skipped. */
  sharedScanId?: string | null;
}

export interface VisibilityCheckPayload {
  tenantId: string;
  marketplace: string;
  sku: string;
  keyword: string;
  rank: number | null;
  page: number | null;
  isIndexed: boolean;
  isOnFirstPage: boolean;
  searchResultCount?: number;
  /** Optional FK to shared_visibility_scans (migration 0027). */
  sharedScanId?: string | null;
}

// ── Client-side (browser session) ─────────────────────────────────────────────

/** Load the signed-in user's visibility checks, newest-first.
 *  Optionally filter by SKU or keyword. */
export async function loadVisibilityChecks(opts?: {
  sku?: string;
  marketplace?: string;
  limit?: number;
}): Promise<StoredVisibilityCheck[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("checked_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.sku) query = query.eq("sku", opts.sku);
  if (opts?.marketplace) query = query.eq("marketplace", opts.marketplace);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map(mapRow);
}

/** Latest visibility for a SKU: shared current rank, then personal history. */
export async function loadLatestVisibilityCheck(
  sku: string,
  marketplace?: string,
): Promise<StoredVisibilityCheck | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  return resolveLatestVisibility(supabase, sku, marketplace);
}

/**
 * Server/test variant. Prefers shared_visibility_scans; falls back to this
 * client's visibility_checks history (RLS-scoped when using the anon client).
 */
export async function resolveLatestVisibility(
  supabase: SupabaseClient,
  sku: string,
  marketplace?: string,
): Promise<StoredVisibilityCheck | null> {
  const shared = await loadLatestSharedScan(supabase, sku, marketplace);
  if (shared) {
    return {
      id: shared.id,
      userId: "",
      tenantId: "",
      marketplace: shared.marketplace,
      sku: shared.sku,
      keyword: shared.keyword,
      rank: shared.rank,
      page: shared.page,
      isIndexed: shared.isIndexed,
      isOnFirstPage: shared.isOnFirstPage,
      searchResultCount: shared.searchResultCount ?? null,
      checkedAt: shared.scrapedAt,
      sharedScanId: shared.id,
    };
  }

  let query = supabase
    .from(TABLE)
    .select("*")
    .eq("sku", sku)
    .order("checked_at", { ascending: false })
    .limit(1);
  if (marketplace) query = query.eq("marketplace", marketplace);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

// ── Server-side (service-role / API route / scraping cron) ────────────────────

/**
 * Server-side variant: accepts an explicit SupabaseClient.
 * Called from the scraping API route or cron after searchProductRank() completes.
 * Sets `user_id` explicitly (service-role bypasses RLS — ownership enforced here).
 */
export async function insertVisibilityCheck(
  supabase: SupabaseClient,
  userId: string,
  payload: VisibilityCheckPayload,
): Promise<{ error: string | null }> {
  const base = {
    user_id: userId,
    tenant_id: payload.tenantId,
    marketplace: payload.marketplace,
    sku: payload.sku,
    keyword: payload.keyword,
    rank: payload.rank ?? null,
    page: payload.page ?? null,
    is_indexed: payload.isIndexed,
    is_on_first_page: payload.isOnFirstPage,
    search_result_count: payload.searchResultCount ?? null,
  };

  const withShared = payload.sharedScanId
    ? { ...base, shared_scan_id: payload.sharedScanId }
    : base;

  const first = await supabase.from(TABLE).insert(withShared);
  if (!first.error) return { error: null };

  // 0027 not applied yet: retry without the new column so history still lands.
  if (payload.sharedScanId) {
    const retry = await supabase.from(TABLE).insert(base);
    if (!retry.error) return { error: null };
    return { error: retry.error.message };
  }

  return { error: first.error.message };
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): StoredVisibilityCheck {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    tenantId: String(r.tenant_id),
    marketplace: String(r.marketplace),
    sku: String(r.sku),
    keyword: String(r.keyword),
    rank: r.rank != null ? Number(r.rank) : null,
    page: r.page != null ? Number(r.page) : null,
    isIndexed: Boolean(r.is_indexed),
    isOnFirstPage: Boolean(r.is_on_first_page),
    searchResultCount: r.search_result_count != null ? Number(r.search_result_count) : null,
    checkedAt: String(r.checked_at),
    sharedScanId: r.shared_scan_id != null ? String(r.shared_scan_id) : null,
  };
}
