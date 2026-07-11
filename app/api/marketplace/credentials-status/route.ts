import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/marketplace/credentials-status
 *
 * Which marketplaces does this signed-in user have real (encrypted)
 * credentials stored for — used by the dashboard to decide which
 * marketplaces get a "Refresh" button (only the ones with a real API
 * integration behind them; CSV/manual/demo connections have nothing to
 * resync).
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

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ marketplaces: [] });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ marketplaces: [] });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ marketplaces: [] });
  }

  const { data, error } = await supabase
    .from("marketplace_credentials")
    .select("marketplace")
    .eq("user_id", userData.user.id);
  if (error || !data) {
    return NextResponse.json({ marketplaces: [] });
  }

  return NextResponse.json({ marketplaces: (data as { marketplace: string }[]).map((r) => r.marketplace) });
}
