import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { amazonTrConsentUrl } from "@/lib/amazon-sp-api/constants";
import { isAmazonLwaConfigured } from "@/lib/amazon-sp-api/live";
import { AMAZON_OAUTH_STATE_COOKIE, AMAZON_OAUTH_USER_TOKEN_COOKIE } from "@/lib/amazon-sp-api/oauth-cookies";

/**
 * POST /api/amazon/oauth/start
 *
 * Website authorization workflow step 3
 * (https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow):
 * redirect the seller to Seller Central TR consent.
 *
 * Does NOT call the Orders API. Live order pull stays gated.
 */

export const runtime = "nodejs";

const COOKIE_MAX_AGE_SECONDS = 600;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const clientId = process.env.AMAZON_LWA_CLIENT_ID?.trim();
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET?.trim();
  const applicationId = process.env.AMAZON_APPLICATION_ID?.trim();
  if (!isAmazonLwaConfigured() || !clientId || !clientSecret || !applicationId) {
    return NextResponse.json(
      { error: "Amazon TR entegrasyonu yapılandırılmamış (AMAZON_LWA_CLIENT_ID / AMAZON_APPLICATION_ID eksik)." },
      { status: 500 },
    );
  }

  const state = randomBytes(24).toString("hex");
  const draft = process.env.AMAZON_APP_DRAFT === "1";
  const redirectUrl = amazonTrConsentUrl({ applicationId, state, draft });

  const res = NextResponse.json({ redirectUrl });
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/api/amazon/oauth",
  };
  res.cookies.set(AMAZON_OAUTH_STATE_COOKIE, state, cookieOpts);
  res.cookies.set(AMAZON_OAUTH_USER_TOKEN_COOKIE, accessToken, cookieOpts);
  return res;
}
