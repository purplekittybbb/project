/**
 * Profit calculation history persistence (Supabase table `profit_calc_history`,
 * migration 0014). SEPARATE from decision_ledger (which records credit
 * decisions) — this records "what did we compute the profit to be, and when".
 *
 * GRACEFUL DEGRADATION: tolerates the table not existing yet (0014 unapplied)
 * and a missing Supabase config — soft-fails instead of throwing. Append-only:
 * the table has no update/delete policy. RLS scopes rows to the signed-in user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

export interface ProfitHistoryEntry {
  tenantId: string;
  marketplace: string;
  /** null/undefined = a portfolio-level (aggregate) snapshot. */
  sku?: string | null;
  currency: string;
  grossRevenue: number;
  netProfit: number;
  netMarginPct: number;
  totalDeductions: number;
  /** Full fee/cost waterfall, stored as jsonb for later drill-down. */
  breakdown?: Record<string, number>;
}

export interface StoredProfitHistoryEntry extends ProfitHistoryEntry {
  id: string;
  computedAt: string;
}

/** Append one profit-calculation snapshot for the signed-in user. */
export async function recordProfitCalc(entry: ProfitHistoryEntry): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: "No active session." };

  const { error } = await supabase.from("profit_calc_history").insert({
    user_id: userId,
    tenant_id: entry.tenantId,
    marketplace: entry.marketplace,
    sku: entry.sku ?? null,
    currency: entry.currency,
    gross_revenue: entry.grossRevenue,
    net_profit: entry.netProfit,
    net_margin_pct: entry.netMarginPct,
    total_deductions: entry.totalDeductions,
    breakdown: entry.breakdown ?? {},
  });
  return { error: error ? error.message : null };
}

/**
 * Server-side variant: accepts an explicit SupabaseClient (service-role
 * for cron/resync). Sets `user_id` explicitly for the same reason as
 * `insertLossAlarms` — service-role bypasses RLS, ownership is enforced
 * by writing the userId directly.
 */
export async function insertProfitCalc(
  supabase: SupabaseClient,
  userId: string,
  entry: ProfitHistoryEntry,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("profit_calc_history").insert({
    user_id: userId,
    tenant_id: entry.tenantId,
    marketplace: entry.marketplace,
    sku: entry.sku ?? null,
    currency: entry.currency,
    gross_revenue: entry.grossRevenue,
    net_profit: entry.netProfit,
    net_margin_pct: entry.netMarginPct,
    total_deductions: entry.totalDeductions,
    breakdown: entry.breakdown ?? {},
  });
  return { error: error ? error.message : null };
}

/** Load the signed-in user's profit-calc snapshots, newest-first. */
export async function loadProfitHistory(): Promise<StoredProfitHistoryEntry[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("profit_calc_history")
    .select("*")
    .order("computed_at", { ascending: false });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    marketplace: String(r.marketplace ?? "combined"),
    sku: r.sku ? String(r.sku) : null,
    currency: String(r.currency ?? "TRY"),
    grossRevenue: Number(r.gross_revenue),
    netProfit: Number(r.net_profit),
    netMarginPct: Number(r.net_margin_pct),
    totalDeductions: Number(r.total_deductions),
    breakdown: (r.breakdown as Record<string, number>) ?? {},
    computedAt: String(r.computed_at),
  }));
}
