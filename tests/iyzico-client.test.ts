/**
 * Tests for lib/iyzico/client.ts
 *
 * SANDBOX ONLY — all tests run against the sandbox URL.
 * No real iyzico API calls are made (fetch is mocked).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SANDBOX_URL = "https://sandbox-api.iyzipay.com";
const PRODUCTION_URL = "https://api.iyzipay.com";

const TEST_API_KEY = "sandbox-api-key-test";
const TEST_SECRET_KEY = "sandbox-secret-key-test";
const TEST_CONFIG = { apiKey: TEST_API_KEY, secretKey: TEST_SECRET_KEY, baseUrl: SANDBOX_URL };

// ── buildIyzicoV2Auth / IYZWSv2 signature ────────────────────────────────────

describe("buildIyzicoV2Auth (IYZWSv2 algorithm)", () => {
  it("produces correct IYZWSv2 Authorization header", async () => {
    const { buildIyzicoV2Auth } = await import("@/lib/iyzico/client");

    const rnd  = "testRandom";
    const path = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
    const body = { locale: "tr", price: "400.0" };

    const result = buildIyzicoV2Auth(TEST_CONFIG, rnd, path, body);

    // Manually compute expected
    const bodyStr   = JSON.stringify(body);
    const signature = createHmac("sha256", TEST_SECRET_KEY)
      .update(rnd + path + bodyStr)
      .digest("hex");
    const params  = `apiKey:${TEST_API_KEY}&randomKey:${rnd}&signature:${signature}`;
    const expected = "IYZWSv2 " + Buffer.from(params).toString("base64");

    expect(result).toBe(expected);
  });

  it("starts with 'IYZWSv2 '", async () => {
    const { buildIyzicoV2Auth } = await import("@/lib/iyzico/client");
    const result = buildIyzicoV2Auth(TEST_CONFIG, "rnd", "/some/path", { a: 1 });
    expect(result.startsWith("IYZWSv2 ")).toBe(true);
  });

  it("signature changes when randomString changes", async () => {
    const { buildIyzicoV2Auth } = await import("@/lib/iyzico/client");
    const path = "/payment/test";
    const body = { locale: "tr" };
    const h1 = buildIyzicoV2Auth(TEST_CONFIG, "rnd1", path, body);
    const h2 = buildIyzicoV2Auth(TEST_CONFIG, "rnd2", path, body);
    expect(h1).not.toBe(h2);
  });

  it("signature changes when body changes", async () => {
    const { buildIyzicoV2Auth } = await import("@/lib/iyzico/client");
    const h1 = buildIyzicoV2Auth(TEST_CONFIG, "rnd", "/p", { price: "1.0" });
    const h2 = buildIyzicoV2Auth(TEST_CONFIG, "rnd", "/p", { price: "2.0" });
    expect(h1).not.toBe(h2);
  });
});

// ── formatIyzicoPrice ─────────────────────────────────────────────────────────

describe("formatIyzicoPrice", () => {
  it("appends .0 to integer prices", async () => {
    const { formatIyzicoPrice } = await import("@/lib/iyzico/client");
    expect(formatIyzicoPrice("400")).toBe("400.0");
    expect(formatIyzicoPrice("1")).toBe("1.0");
    expect(formatIyzicoPrice(400)).toBe("400.0");
  });

  it("preserves decimal prices", async () => {
    const { formatIyzicoPrice } = await import("@/lib/iyzico/client");
    expect(formatIyzicoPrice("400.5")).toBe("400.5");
    expect(formatIyzicoPrice("1.99")).toBe("1.99");
  });

  it("normalises '400.00' to '400.0'", async () => {
    const { formatIyzicoPrice } = await import("@/lib/iyzico/client");
    expect(formatIyzicoPrice("400.00")).toBe("400.0");
  });
});

// ── Sandbox guard ─────────────────────────────────────────────────────────────

describe("assertSandbox (via initCheckoutForm)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ status: "success", checkoutFormContent: "<form/>", token: "tok123" }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows sandbox URL", async () => {
    const { initCheckoutForm } = await import("@/lib/iyzico/client");

    const result = await initCheckoutForm(TEST_CONFIG, {
      price: "400.00",
      paidPrice: "400.00",
      currency: "TRY",
      basketId: "basket-1",
      callbackUrl: "https://example.com/callback",
      buyerEmail: "test@test.com",
      buyerName: "Test",
      buyerSurname: "User",
      buyerId: "user-uuid",
      planId: "starter",
    });

    expect(result.status).toBe("success");
    expect(result.checkoutFormContent).toBe("<form/>");
    expect(result.token).toBe("tok123");
  });

  it("throws for production URL", async () => {
    const { initCheckoutForm } = await import("@/lib/iyzico/client");
    const prodConfig = { ...TEST_CONFIG, baseUrl: PRODUCTION_URL };

    await expect(
      initCheckoutForm(prodConfig, {
        price: "400.00",
        paidPrice: "400.00",
        currency: "TRY",
        basketId: "basket-1",
        callbackUrl: "https://example.com/callback",
        buyerEmail: "test@test.com",
        buyerName: "Test",
        buyerSurname: "User",
        buyerId: "user-uuid",
        planId: "starter",
      })
    ).rejects.toThrow(/sandbox URL/i);
  });

  it("returns failure result on iyzico API error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        status: "failure",
        errorCode: "10000",
        errorMessage: "Geçersiz istek",
      }),
    }));

    const { initCheckoutForm } = await import("@/lib/iyzico/client");

    const result = await initCheckoutForm(TEST_CONFIG, {
      price: "400.00",
      paidPrice: "400.00",
      currency: "TRY",
      basketId: "basket-2",
      callbackUrl: "https://example.com/callback",
      buyerEmail: "test@test.com",
      buyerName: "Test",
      buyerSurname: "User",
      buyerId: "user-uuid",
      planId: "pro",
    });

    expect(result.status).toBe("failure");
    expect(result.errorMessage).toContain("Geçersiz istek");
  });
});

// ── retrieveCheckoutFormResult ────────────────────────────────────────────────

describe("retrieveCheckoutFormResult", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success + paymentStatus when iyzico responds successfully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        status: "success",
        paymentStatus: "SUCCESS",
      }),
    }));

    const { retrieveCheckoutFormResult } = await import("@/lib/iyzico/client");

    const result = await retrieveCheckoutFormResult(TEST_CONFIG, "test-token");
    expect(result.status).toBe("success");
    expect(result.paymentStatus).toBe("SUCCESS");
  });

  it("handles network errors gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unreachable")));

    const { retrieveCheckoutFormResult } = await import("@/lib/iyzico/client");

    const result = await retrieveCheckoutFormResult(TEST_CONFIG, "test-token");
    expect(result.status).toBe("failure");
    expect(result.errorMessage).toContain("Network error");
  });

  it("throws for production URL", async () => {
    const { retrieveCheckoutFormResult } = await import("@/lib/iyzico/client");
    const prodConfig = { ...TEST_CONFIG, baseUrl: PRODUCTION_URL };

    await expect(retrieveCheckoutFormResult(prodConfig, "tok")).rejects.toThrow(/sandbox URL/i);
  });
});
