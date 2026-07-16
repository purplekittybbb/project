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

/**
 * The CURRENT access token, fetched fresh at call time — never cache this in
 * component state and reuse it minutes later. supabase-js auto-refreshes the
 * underlying session (autoRefreshToken: true above), rotating the access
 * token string periodically; a token captured once (e.g. on page mount) and
 * held in React state stops tracking that rotation, so a slow flow — collecting
 * a Trendyol/Hepsiburada API key from the seller's own panel, then filling out
 * a card form, confirming with Stripe, possibly a 3-D Secure redirect — can
 * easily outlive it. The user then hits a confusing "Oturum geçersiz" AFTER
 * Stripe already confirmed their card, even though they never actually signed
 * out. Call this immediately before every authenticated fetch instead.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
