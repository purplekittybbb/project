import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isResyncableMarketplace, resyncMarketplace } from "@/lib/marketplace-resync";

/**
 * POST /api/marketplace/auto-reconnect
 *
 * Called from /connect for a signed-in user with an EMPTY user_transactions
 * table (see the caller — it never runs otherwise). Looks up every
 * marketplace this user has stored (encrypted) credentials for and silently
 * re-syncs each one — no form shown. Fixes the exact gap that made
 * marketplace_credentials write-only: a returning user (e.g. after "Clear",
 * or on a fresh device/session) previously had to re-enter their API key
 * even though it was already saved and still valid.
 *
 * A marketplace whose stored credentials are now rejected (401/403 — key
 * revoked/expired) is reported in `failed`, NOT retried here; the caller
 * falls back to showing that marketplace's connect form.
 */

export const runtime = "nodejs";

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz — lütfen tekrar giriş yapın." }, { status: 401 });
  }
  const userId = userData.user.id;

  // Defense-in-depth: only ever act when the user genuinely has no data yet.
  // The /connect caller already checks this client-side, but a server-side
  // re-check means this route can never silently overwrite/duplicate a real
  // user's existing rows even if called directly.
  const { count } = await supabase
    .from("user_transactions")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ attempted: [], connected: [], failed: [] });
  }

  const { data: credRows, error: credError } = await supabase
    .from("marketplace_credentials")
    .select("marketplace")
    .eq("user_id", userId);
  if (credError || !credRows || credRows.length === 0) {
    return NextResponse.json({ attempted: [], connected: [], failed: [] });
  }

  const attempted: string[] = [];
  const connected: string[] = [];
  const failed: { marketplace: string; error: string }[] = [];

  for (const row of credRows as { marketplace: string }[]) {
    const marketplace = row.marketplace;
    if (!isResyncableMarketplace(marketplace)) continue;
    attempted.push(marketplace);
    const result = await resyncMarketplace(supabase, userId, marketplace);
    if (result.success) {
      connected.push(marketplace);
    } else {
      failed.push({ marketplace, error: result.error });
    }
  }

  return NextResponse.json({ attempted, connected, failed });
}
