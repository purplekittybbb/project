/**
 * Loss alarm persistence (Supabase table `loss_alarms`, migration 0013).
 *
 * Turns the automatic detection in lib/calc/loss-alarm.ts into a durable record:
 * `recordLossAlarmsForTransactions` computes the current per-SKU alarms and
 * writes them, so a money-losing SKU is logged over time rather than only shown
 * as a transient colour.
 *
 * GRACEFUL DEGRADATION: tolerates the table not existing yet (0013 unapplied)
 * and a missing Supabase config — soft-fails (returns an error string / empty
 * list) instead of throwing. RLS scopes every row to the signed-in user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { detectLossAlarms, type LossAlarm, type LossAlarmThresholds } from "../calc/loss-alarm";
import { perSkuMargins } from "../domain/margin-engine";
import type { Transaction } from "../domain/canonical";

const TABLE = "loss_alarms";

export interface StoredLossAlarm extends LossAlarm {
  id: string;
  detectedAt: string;
  resolvedAt: string | null;
}

/** Persist a set of already-detected alarms for the signed-in user. */
export async function recordLossAlarms(
  tenantId: string,
  marketplace: string,
  alarms: LossAlarm[],
): Promise<{ error: string | null; recorded: number }> {
  if (alarms.length === 0) return { error: null, recorded: 0 };
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured.", recorded: 0 };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: "No active session.", recorded: 0 };

  const payload = alarms.map((a) => ({
    user_id: userId,
    tenant_id: tenantId,
    marketplace,
    sku: a.sku,
    category: a.category,
    level: a.level,
    true_margin_pct: a.trueMarginPct,
    perceived_margin_pct: a.perceivedMarginPct,
    return_rate_pct: a.returnRatePct,
    is_silent_loser: a.isSilentLoser,
    message: a.message,
  }));

  const { error } = await supabase.from(TABLE).insert(payload);
  return { error: error ? error.message : null, recorded: error ? 0 : payload.length };
}

/**
 * Compute the current alarms for a set of canonical transactions and persist
 * them in one call. Returns the alarms it detected (even if the write soft-fails
 * because the migration isn't applied yet).
 */
export async function recordLossAlarmsForTransactions(
  tenantId: string,
  marketplace: string,
  txs: Transaction[],
  thresholds?: LossAlarmThresholds,
): Promise<{ alarms: LossAlarm[]; error: string | null; recorded: number }> {
  const alarms = detectLossAlarms(perSkuMargins(txs), thresholds ?? undefined);
  const { error, recorded } = await recordLossAlarms(tenantId, marketplace, alarms);
  return { alarms, error, recorded };
}

/** Load the signed-in user's alarms, newest-first. */
export async function loadLossAlarms(onlyUnresolved = false): Promise<StoredLossAlarm[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase.from(TABLE).select("*").order("detected_at", { ascending: false });
  if (onlyUnresolved) query = query.is("resolved_at", null);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    sku: String(r.sku),
    category: String(r.category ?? "Diğer"),
    level: r.level as LossAlarm["level"],
    trueMarginPct: Number(r.true_margin_pct),
    perceivedMarginPct: Number(r.perceived_margin_pct),
    returnRatePct: Number(r.return_rate_pct),
    isSilentLoser: Boolean(r.is_silent_loser),
    message: String(r.message ?? ""),
    detectedAt: String(r.detected_at),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
  }));
}

/**
 * Server-side variant: accepts an explicit SupabaseClient (e.g. the
 * service-role client used by the cron / resyncMarketplace). Bypasses the
 * browser-session lookup so it can be called from Node server code.
 * The `userId` is the row owner and is written to `user_id` explicitly
 * (rather than relying on `auth.uid()` default) because the service-role
 * client bypasses RLS — we still enforce ownership at the data level.
 */
export async function insertLossAlarms(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  marketplace: string,
  alarms: LossAlarm[],
): Promise<{ error: string | null; recorded: number }> {
  if (alarms.length === 0) return { error: null, recorded: 0 };
  const payload = alarms.map((a) => ({
    user_id: userId,
    tenant_id: tenantId,
    marketplace,
    sku: a.sku,
    category: a.category,
    level: a.level,
    true_margin_pct: a.trueMarginPct,
    perceived_margin_pct: a.perceivedMarginPct,
    return_rate_pct: a.returnRatePct,
    is_silent_loser: a.isSilentLoser,
    message: a.message,
  }));
  const { error } = await supabase.from(TABLE).insert(payload);
  return { error: error ? error.message : null, recorded: error ? 0 : payload.length };
}

/** Mark one alarm resolved (RLS ensures it must be the user's own). */
export async function resolveLossAlarm(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase
    .from(TABLE)
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error ? error.message : null };
}
