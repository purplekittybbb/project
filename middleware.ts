/**
 * Next.js middleware — authentication + subscription gating.
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
 *   Premium     — auth + active subscription required (visibility scan cron,
 *                 demand estimation API, top-100 analysis)
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
  "/demo",
  "/api/auth",
  "/api/tools",            // Guest standalone tool queries (rate-limited)
  "/api/billing/iyzico",   // checkout/callback must be reachable pre-login
  "/_next",
  "/favicon",
  "/icons",
  "/downloads",            // static downloads (e.g. Chrome uzantısı .zip)
  "/api/extension/lookup", // Chrome uzantısı — auth'u kendi Bearer token'ı ile yapar, cookie session yok
  "/api/chat",             // Copilot — /demo (public) için de kullanılıyor; route.ts kendi içinde
                            // resolveSellerData() ile ayırıyor: seed/demo tenantId'ler (seller-a/b/c)
                            // token'sız çalışır, ama gerçek USER_TENANT_ID için accessToken + Supabase
                            // auth.getUser() + RLS zorunlu (route.ts satır ~117-134). Bu middleware'in
                            // genel oturum kontrolü olmadan da route zaten güvenli; eskiden bu satır
                            // eksikti ve demodaki her Copilot sorusu ham "Oturum gerekli." JSON hatası
                            // döndürüyordu — vaad edilen bir özellik demoda tamamen çalışmıyordu.
  "/sitemap.xml",          // Googlebot vb. crawler'lar auth cookie'si taşımaz — public olmalı
  "/robots.txt",           // aynı sebep; ayrıca sitemap.xml'i referans ediyor
];

/**
 * Prefixes that require an active subscription IN ADDITION to auth.
 * Other authenticated routes only require a valid session.
 */
const PREMIUM_PREFIXES = [
  "/api/cron/scan-visibility",
  "/api/demand",
  "/api/top100",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => p === "/" ? pathname === "/" : pathname.startsWith(p));
}

function isPremium(pathname: string): boolean {
  return PREMIUM_PREFIXES.some((p) => pathname.startsWith(p));
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
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
        "[middleware] Subscription check failed-open — granting access (userId=%s, path=%s). " +
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

// ── Config: which routes does the middleware run on? ─────────────────────────

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
