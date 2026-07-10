import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl, isValidShopDomain, normalizeShopDomain } from "@/lib/shopify-api/client";

/**
 * POST /api/shopify/oauth/start
 *
 * Real Shopify OAuth requires a top-level browser navigation to Shopify's
 * own site (the merchant approves access there) — it can't happen inside a
 * fetch(). So the client calls this route first (a normal authenticated
 * fetch, carrying the Supabase access token) to get back a real Shopify
 * authorize URL, then does `window.location.href = redirectUrl` itself.
 *
 * The state nonce and the caller's Supabase access token are stashed in
 * short-lived httpOnly cookies (sameSite=lax, so they survive the
 * cross-site redirect back from Shopify) — the callback route reads them to
 * (a) verify this isn't a forged callback and (b) know which signed-in user
 * to save the connection against, since Shopify's callback carries no
 * Supabase identity of its own.
 */

export const runtime = "nodejs";

const STATE_COOKIE = "shopify_oauth_state";
const USER_TOKEN_COOKIE = "shopify_oauth_user_token";
const SHOP_COOKIE = "shopify_oauth_shop";
const COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes — the whole approve-and-return round trip should be fast

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Shopify entegrasyonu yapılandırılmamış (SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET eksik)." },
      { status: 500 }
    );
  }

  let body: { shop?: string };
  try {
    body = (await req.json()) as { shop?: string };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const shopInput = body.shop?.trim();
  if (!shopInput) {
    return NextResponse.json({ error: "Mağaza adresi gerekli." }, { status: 400 });
  }
  const shop = normalizeShopDomain(shopInput);
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: "Geçersiz Shopify mağaza adresi (örn. mystore.myshopify.com)." }, { status: 400 });
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = new URL("/api/shopify/oauth/callback", req.url).toString();
  const authorizeUrl = buildAuthorizeUrl({ shop, clientId, redirectUri, state });

  const res = NextResponse.json({ redirectUrl: authorizeUrl });
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/api/shopify/oauth",
  };
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  res.cookies.set(USER_TOKEN_COOKIE, accessToken, cookieOpts);
  res.cookies.set(SHOP_COOKIE, shop, cookieOpts);
  return res;
}
