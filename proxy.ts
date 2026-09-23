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
 *   - If Supabase is not configured → pass through (dev/preview environments).
 *   - If the iyzico_subscriptions table doesn't exist (0021 unapplied) →
 *     pass through (subscription check silently degrades to open access).
 *     This means the app stays functional before billing is wired up.
 *
 * ROUTE CLASSIFICATION:
 *   Public      — no auth required (landing page, auth routes, static assets)
 *   Protected   — auth required (dashboard, API routes with user data)
 *   Premium     — auth + active subscription required (reserved for real
 *                 user-facing premium API paths when they exist)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSubscriptionStatus } from "./lib/iyzico/subscription";

// ── Route lists ───────────────────────────────────────────────────────────────

/** Prefixes that are always public — no auth check. */
const PUBLIC_PREFIXES = [
  "/",
  "/pricing",
  "/hakkimizda",
  "/gizlilik",              // Chrome Web Store gizlilik politikası linki — herkese açık olmalı
  "/sss",
  "/blog",
  "/urunler",
  "/araclar",              // Category 1 standalone tools + Category 2 landing gates
  "/login",
  "/signup",
  "/sifremi-unuttum",       // şifre sıfırlama isteği — oturum yokken erişilebilir olmalı
  "/sifre-sifirla",         // şifre sıfırlama e-posta bağlantısının indiği sayfa
  "/kullanim-kosullari",
  "/iptal-iade",
  "/changelog",
  "/yatirimci",            // Marketplace→Credit diligence (seed metrics, lisans dürüstlüğü)
  "/demo",                 // Seed panel walkthrough — oturumsuz; gerçek kullanıcı /dashboard’da
  "/reveal",               // Seed “görünen→gerçek marj” (signed-in seller page içinde bounce)
  "/financing",            // Seed underwriting backtest yüzeyi (lisanslı kredi ürünü değil)
  "/admin",                // Dev queue monitor UI (API hâlâ CRON_SECRET ister)
  "/api/auth",
  "/api/tools",            // Guest standalone tool queries (rate-limited)
  "/api/billing/iyzico",   // checkout/callback must be reachable pre-login
  "/_next",
  "/favicon",
  "/icons",
  "/downloads",            // static downloads (e.g. Chrome uzantısı .zip)
  "/api/extension/lookup", // Chrome uzantısı — auth'u kendi Bearer token'ı ile yapar, cookie session yok
  // /demo public; /api/chat kasıtlı olarak session ister (demo Copilot kapalı —
  // oturumsuz AI kotası yok). Financing/reveal seed yüzeyleri client-side engine.
  "/sitemap.xml",          // Googlebot vb. crawler'lar auth cookie'si taşımaz — public olmalı
  "/robots.txt",           // aynı sebep; ayrıca sitemap.xml'i referans ediyor
];

/**
 * Prefixes that require an active subscription IN ADDITION to auth.
 * Other authenticated routes only require a valid session.
 *
 * Keep this list empty of dead paths. Demand estimation runs client-side in
 * the dashboard; Top 100 is `/api/tools/top100` (public + rate-limited).
 * Cron scanners use CRON_SECRET, not a browser session — do not list them here.
 */
const PREMIUM_PREFIXES: string[] = [
  // Add real user-facing premium API paths here when they exist, e.g.:
  // "/api/visibility/scan",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => p === "/" ? pathname === "/" : pathname.startsWith(p));
}

function isPremium(pathname: string): boolean {
  return PREMIUM_PREFIXES.some((p) => pathname.startsWith(p));
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always pass public routes through immediately.
  if (isPublic(pathname)) return NextResponse.next();

  // Build a Supabase client that reads/refreshes the session cookie.
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Dev/preview with no Supabase config — pass through.
  if (!supabaseUrl || !supabaseAnon) return NextResponse.next();

  const response = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
        );
      },
    },
  });

  // ── Layer 1: Auth check ────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // API routes → 401 JSON; page routes → redirect to sign-in.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Layer 2: Subscription check (premium routes only) ─────────────────────
  if (isPremium(pathname)) {
    const sub = await getSubscriptionStatus(supabase, user.id);

    // Fail-open: DB/network error — log it and let the user through.
    // This is intentional: a paying customer should never be locked out
    // due to a transient Supabase outage. Monitor log frequency.
    if (sub.failOpen) {
      console.warn(
        "[proxy] Subscription check failed-open — granting access (userId=%s, path=%s). " +
        "If this repeats frequently, investigate Supabase connectivity or migration 0021.",
        user.id,
        pathname,
      );
    }

    if (!sub.hasAccess) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "Bu özellik için aktif bir abonelik gereklidir.",
            planRequired: "starter",
            upgradeUrl: "/pricing",
          },
          { status: 402 },  // Payment Required
        );
      }
      return NextResponse.redirect(new URL("/pricing", request.url));
    }
  }

  return response;
}

// ── Config: which routes does the proxy run on? ──────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
