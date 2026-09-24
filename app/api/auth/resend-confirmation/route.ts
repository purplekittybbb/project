import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/resend-confirmation
 * Body: { email: string }
 * Resends signup confirmation email (rate-limited by Supabase).
 */
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Kimlik doğrulama yapılandırılmamış." }, { status: 500 });
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    origin;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${site}/api/auth/callback?next=${encodeURIComponent("/connect")}`,
    },
  });

  if (error) {
    console.error("[auth/resend-confirmation]", error.message);
    // Do not reveal whether the email exists.
    return NextResponse.json({
      ok: true,
      message: "Eğer bu adresle bir hesap varsa onay e-postası yeniden gönderildi.",
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Onay e-postası yeniden gönderildi. Gelen kutunuzu kontrol edin.",
  });
}
