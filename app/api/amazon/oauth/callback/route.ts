import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/security/crypto";
import { exchangeAuthorizationCode, AmazonLwaError } from "@/lib/amazon-sp-api/lwa";
import { AMAZON_OAUTH_STATE_COOKIE, AMAZON_OAUTH_USER_TOKEN_COOKIE } from "@/lib/amazon-sp-api/oauth-cookies";

/**
 * GET /api/amazon/oauth/callback
 *
 * Website authorization workflow steps 10–14: receive spapi_oauth_code,
 * exchange for an LWA refresh token, store it encrypted.
 *
 * Does NOT call GET /orders/v0/orders. First live order pull is a watched
 * joint test (AMAZON_SP_API_LIVE_ENABLED).
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

function redirectWithResult(req: NextRequest, status: "connected" | "error", detail?: string) {
  const url = new URL("/connect", req.url);
  url.searchParams.set("preview", "connect");
  url.searchParams.set("amazon", status);
  if (detail) url.searchParams.set("amazon_error", detail);
  const res = NextResponse.redirect(url);
  res.cookies.delete(AMAZON_OAUTH_STATE_COOKIE);
  res.cookies.delete(AMAZON_OAUTH_USER_TOKEN_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("spapi_oauth_code");
  const state = params.get("state");
  const sellingPartnerId = params.get("selling_partner_id");

  const cookieState = req.cookies.get(AMAZON_OAUTH_STATE_COOKIE)?.value;
  const userAccessToken = req.cookies.get(AMAZON_OAUTH_USER_TOKEN_COOKIE)?.value;

  const clientId = process.env.AMAZON_LWA_CLIENT_ID?.trim();
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return redirectWithResult(req, "error", "Amazon TR entegrasyonu yapılandırılmamış.");
  }

  if (!code || !state || !sellingPartnerId) {
    return redirectWithResult(req, "error", "Eksik parametre.");
  }
  if (!cookieState || state !== cookieState) {
    return redirectWithResult(req, "error", "Güvenlik doğrulaması başarısız (state uyuşmadı).");
  }
  if (!userAccessToken) {
    return redirectWithResult(req, "error", "Oturum bulunamadı — lütfen tekrar giriş yapıp deneyin.");
  }

  const supabase = userScopedClient(userAccessToken);
  if (!supabase) {
    return redirectWithResult(req, "error", "Supabase yapılandırılmamış.");
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return redirectWithResult(req, "error", "Oturum geçersiz — lütfen tekrar giriş yapın.");
  }

  const redirectUri = new URL("/api/amazon/oauth/callback", req.url).toString();
  let refreshToken: string;
  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      redirectUri,
      clientId,
      clientSecret,
    });
    if (!tokens.refreshToken) {
      return redirectWithResult(req, "error", "Amazon yenileme jetonu dönmedi.");
    }
    refreshToken = tokens.refreshToken;
  } catch (err) {
    if (err instanceof AmazonLwaError) {
      console.warn(`[amazon/oauth/callback] LWA rejected: ${err.message}`);
      return redirectWithResult(req, "error", err.message);
    }
    console.error("[amazon/oauth/callback] unexpected LWA error:", err);
    return redirectWithResult(req, "error", "Amazon yetkilendirmesi tamamlanamadı.");
  }

  let apiKeyEncrypted: string;
  let apiSecretEncrypted: string;
  try {
    apiKeyEncrypted = encryptSecret(refreshToken);
    apiSecretEncrypted = encryptSecret(sellingPartnerId);
  } catch (err) {
    console.error("[amazon/oauth/callback] failed to encrypt credentials:", err);
    return redirectWithResult(req, "error", "Kimlik bilgileri şifrelenemedi — sunucu yapılandırması eksik.");
  }

  const { error: credError } = await supabase.from("marketplace_credentials").upsert(
    {
      user_id: userData.user.id,
      marketplace: "amazon_tr",
      seller_id: sellingPartnerId,
      api_key_encrypted: apiKeyEncrypted,
      api_secret_encrypted: apiSecretEncrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace,store_label" },
  );
  if (credError) {
    console.error("[amazon/oauth/callback] failed to store credentials:", credError.message);
    return redirectWithResult(req, "error", "Kimlik bilgileri kaydedilemedi.");
  }

  console.log(
    `[amazon/oauth/callback] stored refresh token for selling_partner_id=${sellingPartnerId}. ` +
      `Orders API NOT called (AMAZON_SP_API_LIVE_ENABLED gate).`,
  );
  return redirectWithResult(req, "connected");
}
