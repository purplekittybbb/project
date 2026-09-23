/**
 * Store-required tool gate — signed in AND (marketplace credentials OR sales rows).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoreGateResult {
  signedIn: boolean;
  hasStore: boolean;
  /** True when user can access store-required features. */
  allowed: boolean;
  connectUrl: string;
  /** Set when a DB read failed — do not treat as "no store". */
  loadError: string | null;
}

export type PresenceCheck =
  | { ok: true; present: boolean }
  | { ok: false; error: string };

export function buildConnectUrl(nextPath: string, baseUrl = ""): string {
  const path = `/connect?next=${encodeURIComponent(nextPath)}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Server-side check: does this user have at least one marketplace credential row?
 */
export async function userHasStoreConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await checkStoreConnection(supabase, userId);
  return result.ok && result.present;
}

export async function checkStoreConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<PresenceCheck> {
  const { count, error } = await supabase
    .from("marketplace_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, present: (count ?? 0) > 0 };
}

/** True when the user has at least one persisted sales row (CSV, manual, or API sync). */
export async function userHasSalesData(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await checkSalesData(supabase, userId);
  return result.ok && result.present;
}

export async function checkSalesData(
  supabase: SupabaseClient,
  userId: string,
): Promise<PresenceCheck> {
  const { count, error } = await supabase
    .from("user_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, present: (count ?? 0) > 0 };
}

export async function evaluateStoreGate(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
  nextPath: string,
): Promise<StoreGateResult> {
  const connectUrl = buildConnectUrl(nextPath);

  if (!userId) {
    return { signedIn: false, hasStore: false, allowed: false, connectUrl, loadError: null };
  }

  if (!supabase) {
    // Dev without Supabase — treat as signed-in but no store (UI shows connect).
    return { signedIn: true, hasStore: false, allowed: false, connectUrl, loadError: null };
  }

  const [creds, sales] = await Promise.all([
    checkStoreConnection(supabase, userId),
    checkSalesData(supabase, userId),
  ]);

  if (!creds.ok || !sales.ok) {
    const message = !creds.ok ? creds.error : (sales as { ok: false; error: string }).error;
    return {
      signedIn: true,
      hasStore: false,
      allowed: false,
      connectUrl,
      loadError: message,
    };
  }

  const hasStore = creds.present || sales.present;
  return {
    signedIn: true,
    hasStore,
    allowed: hasStore,
    connectUrl,
    loadError: null,
  };
}
