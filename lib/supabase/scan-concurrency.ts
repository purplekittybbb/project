/**
 * Cross-instance concurrency guard for live marketplace scrapes.
 *
 * Vercel serverless functions are separate processes — an in-memory counter
 * would not prevent 50 simultaneous invocations from all opening a browser
 * at once. This uses a Postgres-backed lease (migration 0029) so the cap is
 * enforced across every concurrent request, everywhere.
 *
 * Fails OPEN (acquire succeeds) if the migration isn't applied yet or the
 * RPC errors — a missing lock must never turn into a hard outage; it just
 * means the safety net isn't active yet. Once 0029 is applied, it's active.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_MAX_CONCURRENT_PER_MARKETPLACE = 3;
const DEFAULT_LEASE_TTL_SECONDS = 180;

export function maxConcurrentScrapes(): number {
  const raw = process.env.SCRAPE_MAX_CONCURRENT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CONCURRENT_PER_MARKETPLACE;
}

export interface ScrapeSlot {
  /** Present when a slot was acquired — pass back to releaseScrapeSlot(). */
  leaseId: string | null;
  /** True if a slot was acquired (or the guard is inactive, i.e. fail-open). */
  acquired: boolean;
}

export async function acquireScrapeSlot(
  supabase: SupabaseClient | null,
  marketplace: string,
): Promise<ScrapeSlot> {
  if (!supabase) return { leaseId: null, acquired: true };

  try {
    const { data, error } = await supabase.rpc("try_acquire_scrape_slot", {
      p_marketplace: marketplace,
      p_max: maxConcurrentScrapes(),
      p_ttl_seconds: DEFAULT_LEASE_TTL_SECONDS,
    });

    if (error) {
      // Migration not applied yet, or transient RPC error — don't block guests on it.
      return { leaseId: null, acquired: true };
    }

    if (!data) {
      // RPC ran fine and explicitly said "no capacity right now".
      return { leaseId: null, acquired: false };
    }

    return { leaseId: String(data), acquired: true };
  } catch {
    return { leaseId: null, acquired: true };
  }
}

export async function releaseScrapeSlot(
  supabase: SupabaseClient | null,
  leaseId: string | null,
): Promise<void> {
  if (!supabase || !leaseId) return;
  try {
    await supabase.rpc("release_scrape_slot", { p_lease_id: leaseId });
  } catch {
    // Best-effort — a stale lease self-expires via the TTL sweep anyway.
  }
}
