/**
 * Next.js proxy (formerly middleware) — authentication + subscription gating.
 *
 * Next.js 16 renamed the root `middleware.ts` convention to `proxy.ts`.
 * Logic is unchanged: auth + optional premium subscription checks.
 *
 * TWO LAYERS:
 *   1. Auth: protected routes require a valid Supabase session.
 *   2. Subscription: premium routes additionally require an active iyzico
 *      subscription (status = 'active' | 'trialing').
 *
 * GRACEFUL DEGRADATION:
 *   - If Supabase is not configured:
 *       production → block protected routes (never fail-open)
 *       DEMO_MODE=true (non-prod) → pass through for local/investor demos
 *   - If the iyzico_subscriptions table doesn't exist (0021 unapplied) →
 *     pass through (subscription check silently degrades to open access).
 *
 * ROUTE CLASSIFICATION:
 *   Public      — no auth required (landing page, auth routes, static assets)
 *   Protected   — auth required (dashboard, API routes with user data)
 *   Premium     — auth + active subscription required
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSubscriptionStatus } from "./lib/iyzico/subscription";

const PUBLIC_PREFIXES = [
  "/",
  "/pricing",
  "/hakkimizda",
  "/gizlilik",
  "/sss",
  "/blog",
  "/urunler",
  "/araclar",
  "/login",
  "/signup",
  "/dogrula-email",
  "/sifremi-unuttum",
  "/sifre-sifirla",
  "/kullanim-kosullari",
  "/iptal-iade",
  "/changelog",
  "/yatirimci",
  "/demo",
  "/reveal",
  "/financing",
  "/api/auth",
  "/api/tools",
  "/api/billing/iyzico/callback",
  "/api/billing/stripe/webhook",
  "/_next",
  "/favicon",
  "/icons",
  "/downloads",
  "/api/extension/lookup",
  "/sitemap.xml",
  "/robots.txt",
  // Sentry wizard example + browser tunnel (must stay public or auth redirects break testing)
  "/sentry-example-page",
  "/api/sentry-example-api",
  "/monitoring",
];

const PREMIUM_PREFIXES: string[] = [];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

function isPremium(pathname: string): boolean {
  return PREMIUM_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Copy Set-Cookie headers from the working response onto a redirect/JSON reply. */
function withRefreshedCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
  return to;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    const demoBypass =
      process.env.NODE_ENV !== "production" &&
      (process.env.DEMO_MODE === "true" || process.env.DEMO_MODE_ENABLED === "1");
    if (demoBypass) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Kimlik doğrulama yapılandırılmamış." },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        toSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        toSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return withRefreshedCookies(
        response,
        NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }),
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return withRefreshedCookies(response, NextResponse.redirect(loginUrl));
  }

  // Require confirmed email before any protected surface (SaaS onboarding gate).
  // Skip when Demo bypass / email confirmation is not used by the project yet
  // only if the user somehow has a session without the field — still block null.
  if (
    !user.email_confirmed_at &&
    !pathname.startsWith("/dogrula-email") &&
    !pathname.startsWith("/api/auth")
  ) {
    if (pathname.startsWith("/api/")) {
      return withRefreshedCookies(
        response,
        NextResponse.json(
          { error: "E-posta onaylanmamış.", code: "email_unconfirmed" },
          { status: 403 },
        ),
      );
    }
    const verifyUrl = new URL("/dogrula-email", request.url);
    if (user.email) verifyUrl.searchParams.set("email", user.email);
    return withRefreshedCookies(response, NextResponse.redirect(verifyUrl));
  }

  if (isPremium(pathname)) {
    const sub = await getSubscriptionStatus(supabase, user.id);

    if (sub.failOpen) {
      console.warn(
        "[proxy] Subscription check failed-open — granting access (userId=%s, path=%s).",
        user.id,
        pathname,
      );
    }

    if (!sub.hasAccess) {
      if (pathname.startsWith("/api/")) {
        return withRefreshedCookies(
          response,
          NextResponse.json(
            {
              error: "Bu özellik için aktif bir abonelik gereklidir.",
              planRequired: "starter",
              upgradeUrl: "/pricing",
            },
            { status: 402 },
          ),
        );
      }
      return withRefreshedCookies(
        response,
        NextResponse.redirect(new URL("/pricing", request.url)),
      );
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
