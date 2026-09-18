/**
 * Demand estimate persistence (Supabase table `demand_estimates`, migration 0017).
 *
 * Stores the output of lib/demand/signals.ts estimateDemand() so every
 * post-sync run leaves a durable per-SKU demand snapshot. Append-only
 * (no update/delete policy on the table).
 *
 * GRACEFUL DEGRADATION: tolerates the table not existing yet (0017 unapplied)
 * and a missing Supabase config — soft-fails instead of throwing.
 * RLS scopes every row to the signed-in user (auth.uid() = user_id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import type { DemandRangeResult } from "../demand/signals";

const TABLE = "demand_estimates";

export interface StoredDemandEstimate extends DemandRangeResult {
  id: string;
  userId: string;
  tenantId: string;
  marketplace: string;
  sku: string;
  estimatedAt: string;
}

// ── Client-side (browser session) ─────────────────────────────────────────────

/**
 * Append one demand estimate snapshot for the signed-in user.
 * Called from browser code after a manual re-calc.
 */
export async function recordDemandEstimate(
  tenantId: string,
  marketplace: string,
  sku: string,
  estimate: DemandRangeResult,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: "No active session." };

  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    tenant_id: tenantId,
    marketplace,
    sku,
    range_low: estimate.rangeLow,
    range_high: estimate.rangeHigh,
    confidence_score: estimate.confidenceScore,
    confidence_level: estimate.confidenceLevel,
    signals_used: estimate.signalsUsed,
    explanation: estimate.explanation,
  });
  return { error: error ? error.message : null };
}

/** Load the signed-in user's demand estimates, newest-first.
 *  Optionally filter by SKU. */
export async function loadDemandEstimates(sku?: string): Promise<StoredDemandEstimate[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("estimated_at", { ascending: false });
  if (sku) query = query.eq("sku", sku);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    tenantId: String(r.tenant_id),
    marketplace: String(r.marketplace),
    sku: String(r.sku),
    rangeLow: Number(r.range_low),
    rangeHigh: Number(r.range_high),
    confidenceScore: Number(r.confidence_score),
    confidenceLevel: r.confidence_level as "high" | "medium" | "low",
    signalsUsed: (r.signals_used as string[]) ?? [],
    factors: [], // DB'de saklanmıyor; ağırlıklı faktörler yalnızca taze tahminde
    explanation: String(r.explanation ?? ""),
    estimatedAt: String(r.estimated_at),
  }));
}

/** Latest estimate for a specific SKU (newest row). Returns null if none. */
export async function loadLatestDemandEstimate(
  sku: string,
  marketplace?: string,
): Promise<StoredDemandEstimate | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  let query = supabase
    .from(TABLE)
    .select("*")
    .eq("sku", sku)
    .order("estimated_at", { ascending: false })
    .limit(1);
  if (marketplace) query = query.eq("marketplace", marketplace);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    userId: String(r.user_id),
    tenantId: String(r.tenant_id),
    marketplace: String(r.marketplace),
    sku: String(r.sku),
    rangeLow: Number(r.range_low),
    rangeHigh: Number(r.range_high),
    confidenceScore: Number(r.confidence_score),
    confidenceLevel: r.confidence_level as "high" | "medium" | "low",
    signalsUsed: (r.signals_used as string[]) ?? [],
    factors: [], // DB'de saklanmıyor; ağırlıklı faktörler yalnızca taze tahminde
    explanation: String(r.explanation ?? ""),
    estimatedAt: String(r.estimated_at),
  };
}

// ── Server-side (service-role / cron) ─────────────────────────────────────────

/**
 * Server-side variant: accepts an explicit SupabaseClient (service-role
 * for cron/resyncMarketplace). Sets `user_id` explicitly because the
 * service-role client bypasses RLS — ownership is enforced at the data level.
 */
export async function insertDemandEstimate(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  marketplace: string,
  sku: string,
  estimate: DemandRangeResult,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    tenant_id: tenantId,
    marketplace,
    sku,
    range_low: estimate.rangeLow,
    range_high: estimate.rangeHigh,
    confidence_score: estimate.confidenceScore,
    confidence_level: estimate.confidenceLevel,
    signals_used: estimate.signalsUsed,
    explanation: estimate.explanation,
  });
  return { error: error ? error.message : null };
}
