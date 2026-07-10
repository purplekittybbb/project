/**
 * Supabase browser client.
 *
 * Auth runs entirely in the browser (email/password), so the URL and anon key
 * must be exposed to the client — hence the NEXT_PUBLIC_ prefix. The anon key is
 * safe to ship publicly; row-level security on the Supabase side is what protects
 * data. Passwords are hashed and stored by Supabase (bcrypt) — never by us.
 *
 * Graceful degradation: if the env vars are not set, getSupabaseClient() returns
 * null. Login/signup then fall back to demo behaviour (straight to /dashboard) and
 * the protected route treats the app as open — so the landing + demo never break
 * for someone who just cloned the repo without keys.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

/** True when Supabase env vars are configured. */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
