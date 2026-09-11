import { NextRequest, NextResponse } from "next/server";
import { AMAZON_OAUTH_STATE_COOKIE, AMAZON_OAUTH_USER_TOKEN_COOKIE } from "@/lib/amazon-sp-api/oauth-cookies";

/**
 * GET /api/amazon/oauth/login
 *
 * Amazon's "log-in URI" (website authorization workflow steps 5–8).
 * Amazon sends amazon_callback_uri, amazon_state, selling_partner_id.
 * We bounce the seller back to amazon_callback_uri with our CSRF state.
 *
 * Must be registered as the application's login URI in Seller Central /
 * Solution Provider Portal.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const amazonCallbackUri = req.nextUrl.searchParams.get("amazon_callback_uri");
  const amazonState = req.nextUrl.searchParams.get("amazon_state");
  const version = req.nextUrl.searchParams.get("version");

  const ourState = req.cookies.get(AMAZON_OAUTH_STATE_COOKIE)?.value;
  const userToken = req.cookies.get(AMAZON_OAUTH_USER_TOKEN_COOKIE)?.value;

  if (!amazonCallbackUri || !amazonState) {
    return NextResponse.json({ error: "Eksik Amazon callback parametreleri." }, { status: 400 });
  }
  if (!ourState || !userToken) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", "/connect");
    return NextResponse.redirect(login);
  }

  // Only bounce back to Amazon callback hosts — never an open redirect.
  let callback: URL;
  try {
    callback = new URL(amazonCallbackUri);
  } catch {
    return NextResponse.json({ error: "Geçersiz amazon_callback_uri." }, { status: 400 });
  }
  if (!callback.hostname.endsWith("amazon.com") && !callback.hostname.endsWith("amazon.com.tr")) {
    return NextResponse.json({ error: "amazon_callback_uri Amazon hostu değil." }, { status: 400 });
  }

  const redirectUri = new URL("/api/amazon/oauth/callback", req.url).toString();
  callback.searchParams.set("amazon_state", amazonState);
  callback.searchParams.set("state", ourState);
  callback.searchParams.set("redirect_uri", redirectUri);
  if (version === "beta") callback.searchParams.set("version", "beta");

  const res = NextResponse.redirect(callback.toString());
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
