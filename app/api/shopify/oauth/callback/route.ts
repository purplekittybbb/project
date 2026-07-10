import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  exchangeCodeForToken, fetchShopifyOrders, mapShopifyOrdersToUserRawRows, verifyCallbackHmac,
  ShopifyAuthError, ShopifyApiError, ShopifyMappingError,
} from "@/lib/shopify-api/client";
import { validateUserRawRows } from "@/lib/domain/schemas";
import { encryptSecret } from "@/lib/security/crypto";

/**
 * GET /api/shopify/oauth/callback
 *
 * Shopify redirects the merchant's browser here (top-level GET) after they
 * approve or deny access on Shopify's own site. Validates the callback is
 * genuinely from Shopify (HMAC signature + state nonce), exchanges the
 * authorization code for a real access token, pulls real orders via
 * GraphQL, stores the (encrypted) token and mapped rows, then redirects
 * back into the app. Any validation failure aborts BEFORE the token
 * exchange — nothing is ever stored on a forged or mismatched callback.
 */

export const runtime = "nodejs";

const STATE_COOKIE = "shopify_oauth_state";
const USER_TOKEN_COOKIE = "shopify_oauth_user_token";
const SHOP_COOKIE = "shopify_oauth_shop";

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function redirectWithResult(req: NextRequest, status: "connected" | "error", detail?: string) {
  const url = new URL("/connect", req.url);
  url.searchParams.set("preview", "connect");
  url.searchParams.set("shopify", status);
  if (detail) url.searchParams.set("shopify_error", detail);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(USER_TOKEN_COOKIE);
  res.cookies.delete(SHOP_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const shopParam = params.get("shop");
  const state = params.get("state");

  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  const userAccessToken = req.cookies.get(USER_TOKEN_COOKIE)?.value;
  const cookieShop = req.cookies.get(SHOP_COOKIE)?.value;

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithResult(req, "error", "Shopify entegrasyonu yapılandırılmamış.");
  }

  // 1) Validate BEFORE trusting anything from this callback — a forged or
  //    mismatched request must never reach the token exchange.
  if (!code || !shopParam || !state) {
    return redirectWithResult(req, "error", "Eksik parametre.");
  }
  if (!cookieState || state !== cookieState) {
    return redirectWithResult(req, "error", "Güvenlik doğrulaması başarısız (state uyuşmadı).");
  }
  if (!cookieShop || shopParam !== cookieShop) {
    return redirectWithResult(req, "error", "Güvenlik doğrulaması başarısız (mağaza uyuşmadı).");
  }
  if (!userAccessToken) {
    return redirectWithResult(req, "error", "Oturum bulunamadı — lütfen tekrar giriş yapıp deneyin.");
  }
  if (!verifyCallbackHmac(params, clientSecret)) {
    return redirectWithResult(req, "error", "Güvenlik doğrulaması başarısız (imza geçersiz).");
  }

  const supabase = userScopedClient(userAccessToken);
  if (!supabase) {
    return redirectWithResult(req, "error", "Supabase yapılandırılmamış.");
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return redirectWithResult(req, "error", "Oturum geçersiz — lütfen tekrar giriş yapın.");
  }
  const userId = userData.user.id;

  // 2) Exchange the code for a REAL access token, then pull real orders.
  //    Any failure here means nothing gets stored.
  let accessToken: string;
  let orders;
  let rawRows;
  try {
    accessToken = await exchangeCodeForToken({ shop: shopParam, clientId, clientSecret, code });
    orders = await fetchShopifyOrders(shopParam, accessToken);
    rawRows = mapShopifyOrdersToUserRawRows(orders);
  } catch (err) {
    if (err instanceof ShopifyAuthError) {
      console.warn(`[shopify/oauth/callback] Shopify rejected the token exchange or access token for ${shopParam}: ${err.message}`);
      return redirectWithResult(req, "error", err.message);
    }
    if (err instanceof ShopifyMappingError) {
      console.error(`[shopify/oauth/callback] Shopify response schema mismatch for ${shopParam}: ${err.message}`);
      return redirectWithResult(req, "error", err.message);
    }
    if (err instanceof ShopifyApiError) {
      console.error(`[shopify/oauth/callback] Shopify API error (status ${err.status}) for ${shopParam}: ${err.message}`);
      return redirectWithResult(req, "error", err.message);
    }
    console.error("[shopify/oauth/callback] unexpected error:", err);
    return redirectWithResult(req, "error", "Shopify'a bağlanılamadı. Lütfen tekrar deneyin.");
  }

  // 3) Zod-validate mapped rows before storage (defense-in-depth).
  const { valid: rows, warnings } = validateUserRawRows(rawRows);
  if (warnings.length > 0) {
    console.warn(`[shopify/oauth/callback] ${warnings.length} row(s) dropped for ${shopParam}:`, warnings);
  }

  // 4) Persist encrypted credentials. Shopify only has ONE real secret (the
  //    access token) — api_secret_encrypted has no second secret to hold, so
  //    it stores an encrypted empty placeholder to satisfy the NOT NULL
  //    constraint without pretending there's a real second credential.
  const { error: credError } = await supabase.from("marketplace_credentials").upsert(
    {
      user_id: userId,
      marketplace: "shopify",
      seller_id: shopParam,
      api_key_encrypted: encryptSecret(accessToken),
      api_secret_encrypted: encryptSecret(""),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace" }
  );
  if (credError) {
    console.error("[shopify/oauth/callback] failed to store credentials:", credError.message);
    return redirectWithResult(req, "error", "Kimlik bilgileri kaydedilemedi.");
  }

  // 5) Persist the real rows through the same table every other connector uses.
  if (rows.length > 0) {
    const payload = rows.map((r) => ({
      user_id: userId,
      order_id: r.order_id,
      sku: r.sku,
      category: r.category,
      sale_date: r.sale_date,
      units: r.units,
      gross_revenue: r.gross_revenue,
      unit_cost: r.unit_cost,
      shipping: r.shipping,
      return_rate: r.return_rate,
      ad_spend: r.ad_spend,
      marketplace: r.marketplace,
    }));
    const { error: insertError } = await supabase.from("user_transactions").insert(payload);
    if (insertError) {
      console.error("[shopify/oauth/callback] failed to save rows:", insertError.message);
      return redirectWithResult(req, "error", "Veriler kaydedilemedi.");
    }
  }

  console.log(`[shopify/oauth/callback] connected ${shopParam}: ${orders.length} orders fetched, ${rows.length} rows saved`);
  return redirectWithResult(req, "connected");
}
