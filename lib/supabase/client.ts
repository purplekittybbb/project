/**
 * Supabase browser client.
 *
 * Uses `@supabase/ssr` createBrowserClient so the session is stored in
 * cookies that Next.js `proxy.ts` (server) can read. Plain `createClient`
 * only persists to localStorage — then proxy redirects /connect → /login
 * in a loop after a successful sign-in.
 *
 * The anon key is safe to ship publicly; RLS protects data.
 * SUPABASE_SERVICE_ROLE_KEY must NEVER use NEXT_PUBLIC_ — see service-role.ts.
 *
 * Graceful degradation: missing env → null (demo / clone without keys).
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  cached = createBrowserClient(url, anonKey);
  return cached;
}

/** True when Supabase env vars are configured. */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Fresh access token at call time — never cache in component state.
 * supabase-js auto-refreshes; a token captured on mount can go stale mid-flow.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
