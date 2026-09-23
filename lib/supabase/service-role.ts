/**
 * Server-only Supabase client using the service role key (bypasses RLS).
 *
 * Rules (sıfır ekstra maliyet Faz 1 — do not relax):
 *   - NEVER put SUPABASE_SERVICE_ROLE_KEY behind NEXT_PUBLIC_*.
 *   - NEVER import this module from client components or `"use client"` files.
 *   - Prefer the user-scoped anon client when the caller already has a session
 *     and RLS policies cover the write (e.g. user_transactions).
 *   - Use service role for: cron jobs, webhooks, guest rate limits, shared
 *     cache write-back, iyzico callback, team cross-user reads.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LEAKED_PUBLIC_KEY = "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY";

/**
 * Returns null when URL or service-role key is missing (dev / misconfigured).
 * Throws if a NEXT_PUBLIC_ service-role env is present — that would ship the
 * secret to the browser bundle.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  if (typeof process.env[LEAKED_PUBLIC_KEY] === "string" && process.env[LEAKED_PUBLIC_KEY]!.trim()) {
    throw new Error(
      `${LEAKED_PUBLIC_KEY} must never be set — use SUPABASE_SERVICE_ROLE_KEY (server-only).`
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when the server can open a service-role client. */
export function hasServiceRoleConfig(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}
