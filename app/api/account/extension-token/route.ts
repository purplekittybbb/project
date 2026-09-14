import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * Dashboard-side management of the Chrome uzantısı personal access token.
 *
 * Auth: same-origin cookie session (dashboard fetch), same pattern as
 * app/api/tools/barcode/import/route.ts. The raw token is only ever returned
 * once, from POST — only its SHA-256 hash is persisted (supabase/migrations/
 * 0033_extension_tokens.sql). GET reports whether an active token exists
 * without revealing it (there is nothing to reveal — only the hash is
 * stored), so the dashboard can show "Bağlı" vs. "Bağlı değil".
 */

export const runtime = "nodejs";

async function getUserId(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return "tm_ext_" + crypto.randomBytes(24).toString("base64url");
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  const { data, error } = await supabase
    .from("extension_tokens")
    .select("created_at, last_used_at")
    .eq("user_id", userId)
    .maybeSingle();

  // extension_tokens table not migrated yet (0033 unapplied) → fail open as "not connected".
  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: !!data,
    createdAt: data?.created_at ?? null,
    lastUsedAt: data?.last_used_at ?? null,
  });
}

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  const raw = generateRawToken();
  const tokenHash = hashToken(raw);

  // A user has at most one active token — regenerating revokes the previous one.
  await supabase.from("extension_tokens").delete().eq("user_id", userId);

  const { error } = await supabase.from("extension_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.json(
      { error: "Token oluşturulamadı — uzantı tablosu henüz kurulmamış olabilir (migration 0033)." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token: raw });
}

export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  await supabase.from("extension_tokens").delete().eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
