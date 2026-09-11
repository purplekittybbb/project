/**
 * Store-required tool gate — user must be signed in AND have marketplace credentials.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoreGateResult {
  signedIn: boolean;
  hasStore: boolean;
  /** True when user can access store-required features. */
  allowed: boolean;
  connectUrl: string;
}

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
  const { count, error } = await supabase
    .from("marketplace_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return false;
  return (count ?? 0) > 0;
}

export async function evaluateStoreGate(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
  nextPath: string,
): Promise<StoreGateResult> {
  const connectUrl = buildConnectUrl(nextPath);

  if (!userId) {
    return { signedIn: false, hasStore: false, allowed: false, connectUrl };
  }

  if (!supabase) {
    // Dev without Supabase — treat as signed-in but no store (UI shows connect).
    return { signedIn: true, hasStore: false, allowed: false, connectUrl };
  }

  const hasStore = await userHasStoreConnection(supabase, userId);
  return {
    signedIn: true,
    hasStore,
    allowed: hasStore,
    connectUrl,
  };
}
