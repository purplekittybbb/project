import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resyncMarketplace } from "@/lib/marketplace-resync";

/**
 * POST /api/marketplace/resync
 *
 * Manually re-fetch one marketplace's real data using its already-stored
 * (encrypted) credentials — no key/secret in the request body. Backs the
 * dashboard's per-marketplace "Refresh" button, and is reused by
 * /api/marketplace/auto-reconnect for the silent /connect path.
 */

export const runtime = "nodejs";

interface ResyncRequestBody {
  marketplace?: string;
}

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

  let body: ResyncRequestBody;
  try {
    body = (await req.json()) as ResyncRequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const marketplace = body.marketplace?.trim();
  if (!marketplace) {
    return NextResponse.json({ error: "marketplace gerekli." }, { status: 400 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const result = await resyncMarketplace(supabase, userData.user.id, marketplace);
  if (!result.success) {
    return NextResponse.json(result, { status: result.authError ? 401 : 502 });
  }
  return NextResponse.json(result);
}
