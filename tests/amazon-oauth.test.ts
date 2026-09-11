/**
 * Amazon TR OAuth start + callback.
 * Mocked LWA / Supabase only — never hits Amazon, never calls Orders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/crypto", () => ({
  encryptSecret: (v: string) => `enc:${v}`,
}));

vi.mock("@/lib/amazon-sp-api/lwa", () => ({
  exchangeAuthorizationCode: vi.fn(),
  AmazonLwaError: class AmazonLwaError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AmazonLwaError";
    }
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { exchangeAuthorizationCode } from "@/lib/amazon-sp-api/lwa";
import { POST as startOAuth } from "@/app/api/amazon/oauth/start/route";
import { GET as oauthCallback } from "@/app/api/amazon/oauth/callback/route";
import { fetchAmazonTrOrders } from "@/lib/amazon-sp-api/client";
import { AmazonLiveGuardError } from "@/lib/amazon-sp-api/live";

function startReq(auth?: string): NextRequest {
  return new NextRequest("http://localhost/api/amazon/oauth/start", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

function callbackReq(qs: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost/api/amazon/oauth/callback?${qs}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("POST /api/amazon/oauth/start", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("returns 401 without a bearer token", async () => {
    const res = await startOAuth(startReq());
    expect(res.status).toBe(401);
  });

  it("returns 500 when LWA is not configured", async () => {
    delete process.env.AMAZON_LWA_CLIENT_ID;
    delete process.env.AMAZON_LWA_CLIENT_SECRET;
    delete process.env.AMAZON_APPLICATION_ID;
    delete process.env.AMAZON_LWA_LIVE_ENABLED;
    const res = await startOAuth(startReq("Bearer tok"));
    expect(res.status).toBe(500);
  });

  it("returns Seller Central TR consent URL and does not call Orders", async () => {
    process.env.AMAZON_LWA_CLIENT_ID = "amzn1.lwa";
    process.env.AMAZON_LWA_CLIENT_SECRET = "secret";
    process.env.AMAZON_APPLICATION_ID = "amzn1.app.x";
    const res = await startOAuth(startReq("Bearer tok"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirectUrl: string };
    expect(body.redirectUrl).toContain("sellercentral.amazon.com.tr/apps/authorize/consent");
    expect(body.redirectUrl).toContain("application_id=amzn1.app.x");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("amazon_oauth_state=");
  });
});

describe("GET /api/amazon/oauth/callback", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AMAZON_LWA_CLIENT_ID = "amzn1.lwa";
    process.env.AMAZON_LWA_CLIENT_SECRET = "secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("rejects a state mismatch without exchanging the code", async () => {
    const res = await oauthCallback(
      callbackReq("spapi_oauth_code=c&state=A&selling_partner_id=A1", "amazon_oauth_state=B; amazon_oauth_user_token=tok"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("amazon=error");
    expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("stores the refresh token and never calls the Orders API", async () => {
    vi.mocked(exchangeAuthorizationCode).mockResolvedValue({
      accessToken: "Atza|x",
      refreshToken: "Atzr|y",
      expiresIn: 3600,
      tokenType: "bearer",
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => ({ upsert })),
    } as never);

    const res = await oauthCallback(
      callbackReq(
        "spapi_oauth_code=Splxl&state=abc&selling_partner_id=A1SELLER",
        "amazon_oauth_state=abc; amazon_oauth_user_token=user-jwt",
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("amazon=connected");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      user_id: "user-1",
      marketplace: "amazon_tr",
      seller_id: "A1SELLER",
      api_key_encrypted: "enc:Atzr|y",
    });

    delete process.env.AMAZON_SP_API_LIVE_ENABLED;
    await expect(
      fetchAmazonTrOrders({
        refreshToken: "Atzr|y",
        clientId: "id",
        clientSecret: "s",
        createdAfterIso: "2026-08-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(AmazonLiveGuardError);
  });
});
