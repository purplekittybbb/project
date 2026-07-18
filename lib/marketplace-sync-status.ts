/**
 * Persist sync outcome onto marketplace_credentials so the UI (and later
 * devices) can show lastSyncedAt / errors without trusting localStorage.
 *
 * Columns come from migration 0011_marketplace_credentials_sync_status.sql.
 * If that migration hasn't been applied yet, updates fail softly — logged,
 * never thrown — so sync itself still succeeds.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncStatusWrite {
  last_synced_at: string | null;
  last_sync_error: string | null;
  needs_reauth: boolean;
  updated_at: string;
}

export async function recordSyncSuccess(
  supabase: SupabaseClient,
  userId: string,
  marketplace: string
): Promise<void> {
  const now = new Date().toISOString();
  const payload: SyncStatusWrite = {
    last_synced_at: now,
    last_sync_error: null,
    needs_reauth: false,
    updated_at: now,
  };
  const { error } = await supabase
    .from("marketplace_credentials")
    .update(payload)
    .eq("user_id", userId)
    .eq("marketplace", marketplace);
  if (error) {
    // Column missing (migration not applied) or transient DB error — never
    // fail the sync itself over metadata bookkeeping.
    console.warn(
      `[recordSyncSuccess] could not persist sync status for ${marketplace}:`,
      error.message
    );
  }
}

export async function recordSyncFailure(
  supabase: SupabaseClient,
  userId: string,
  marketplace: string,
  errorMessage: string,
  authError: boolean
): Promise<void> {
  const now = new Date().toISOString();
  // Never wipe a prior last_synced_at — sellers still want to know when
  // the last *successful* sync was, even if the latest attempt failed.
  const { error } = await supabase
    .from("marketplace_credentials")
    .update({
      last_sync_error: errorMessage.slice(0, 500),
      needs_reauth: authError,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("marketplace", marketplace);
  if (error) {
    console.warn(
      `[recordSyncFailure] could not persist sync status for ${marketplace}:`,
      error.message
    );
  }
}
