import { NextResponse } from "next/server";

/**
 * POST /api/auth/signup
 *
 * Proxies Supabase Auth signup with a hard timeout. Browser `signUp` can hang
 * indefinitely when SMTP/confirm email is slow — leaving "Hesap oluşturuluyor…"
 * forever. This route fails closed with a clear JSON error after 12s.
 *
 * Body: { email, password, fullName?, company?, plan?, emailRedirectTo? }
 */

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_TIMEOUT_MS = 12_000;

type SignupBody = {
  email?: string;
  password?: string;
  fullName?: string;
  company?: string;
  plan?: string;
  emailRedirectTo?: string;
};

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anon) {
    return NextResponse.json(
      { error: "Kimlik doğrulama yapılandırılmamış." },
      { status: 500 },
    );
  }

  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = (body.fullName ?? "").trim();
  const company = (body.company ?? "").trim();
  const plan = body.plan === "pro" || body.plan === "starter" ? body.plan : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Şifre en az 8 karakter olmalı." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Ad soyad girin." }, { status: 400 });
  }
  if (!company) {
    return NextResponse.json({ error: "Şirket veya mağaza adını girin." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    origin;
  const afterAuth = plan ? `/settings?tab=abonelik&plan=${plan}` : "/connect";
  const emailRedirectTo =
    (body.emailRedirectTo ?? "").trim() ||
    `${site}/api/auth/callback?next=${encodeURIComponent(afterAuth)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGNUP_TIMEOUT_MS);

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        data: {
          full_name: fullName,
          company,
          ...(plan ? { intended_plan: plan } : {}),
        },
        gotrue_meta_security: {},
        email_redirect_to: emailRedirectTo,
      }),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: {
        id?: string;
        email?: string;
        email_confirmed_at?: string | null;
        identities?: unknown[];
      };
      msg?: string;
      error?: string;
      error_description?: string;
      message?: string;
    };

    if (!res.ok) {
      const raw =
        json.msg || json.error_description || json.error || json.message || "";
      if (/already|registered|exists/i.test(raw)) {
        return NextResponse.json(
          {
            error: "Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin.",
            code: "already_registered",
          },
          { status: 409 },
        );
      }
      console.error("[auth/signup]", res.status, raw);
      return NextResponse.json(
        { error: "Kayıt tamamlanamadı. Lütfen tekrar deneyin." },
        { status: 400 },
      );
    }

    const user = json.user ?? (json.id ? { id: json.id, email, identities: [{}] } : null);
    if (user && Array.isArray(user.identities) && user.identities.length === 0) {
      return NextResponse.json(
        {
          error: "Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin.",
          code: "already_registered",
        },
        { status: 409 },
      );
    }

    const hasSession = Boolean(json.access_token && json.refresh_token);
    const confirmed = Boolean(user?.email_confirmed_at) || hasSession;

    return NextResponse.json({
      ok: true,
      email,
      needsConfirm: !confirmed,
      afterAuth,
      session: hasSession
        ? {
            access_token: json.access_token,
            refresh_token: json.refresh_token,
            expires_in: json.expires_in ?? 3600,
          }
        : null,
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name: string }).name === "AbortError");
    if (aborted) {
      return NextResponse.json(
        {
          error:
            "Sunucu yanıt vermedi. İnternetinizi kontrol edip tekrar deneyin.",
          code: "timeout",
        },
        { status: 504 },
      );
    }
    console.error("[auth/signup]", err);
    return NextResponse.json(
      { error: "Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
