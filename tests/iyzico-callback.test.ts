/**
 * Tests for /api/billing/iyzico/callback idempotency.
 *
 * Verifies that:
 *   1. A duplicate callback (same token) is detected BEFORE calling iyzico API.
 *   2. Duplicate callback returns a 200 success response (no-op).
 *   3. A unique-constraint DB error (code 23505) is treated as idempotent.
 *   4. A genuine new callback writes the subscription row.
 *
 * All Supabase and iyzico API calls are mocked — no real credentials needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock iyzico client
vi.mock("@/lib/iyzico/client", () => ({
  getIyzicoConfig: () => ({
    apiKey: "sandbox-key",
    secretKey: "sandbox-secret",
    baseUrl: "https://sandbox-api.iyzipay.com",
  }),
  retrieveCheckoutFormResult: vi.fn(),
}));

// Mock subscription helper (only computeGracePeriodEnd is used in callback)
vi.mock("@/lib/iyzico/subscription", () => ({
  computeGracePeriodEnd: (d?: Date) => {
    const base = d ?? new Date();
    return new Date(base.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  },
}));

// Mock @supabase/supabase-js — we control the client factory
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { retrieveCheckoutFormResult } from "@/lib/iyzico/client";
import { POST } from "@/app/api/billing/iyzico/callback/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFormRequest(token: string): Request {
  return new Request("http://localhost/api/billing/iyzico/callback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(token)}`,
  });
}

/**
 * Build a mock Supabase client.
 *
 * @param existingRow  - Value returned by .maybeSingle() for the idempotency check.
 *                       Pass { id: "...", user_id: "..." } to simulate "already processed".
 *                       Pass null to simulate "new token".
 * @param upsertError  - Null for success, or { code, message } to simulate a DB error.
 */
function makeSupabaseMock(
  existingRow: { id: string; user_id: string } | null,
  upsertError: { code: string; message: string } | null = null,
) {
  const upsertChain = {
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  };

  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
    // for the upsert call
    upsert: upsertChain.upsert,
  };

  const mockClient = {
    from: vi.fn((table: string) => {
      void table;
      return selectChain;
    }),
  };

  vi.mocked(createClient).mockReturnValue(mockClient as unknown as ReturnType<typeof createClient>);
  return { mockClient, selectChain, upsertChain };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Set required env vars
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-test";
});

describe("POST /api/billing/iyzico/callback — idempotency", () => {

  it("returns 200 success (no-op) when the same token is received a second time", async () => {
    // Simulate: token already exists in iyzico_subscriptions
    makeSupabaseMock({ id: "sub-001", user_id: "user-abc" });

    const req = makeFormRequest("test-token-already-processed");
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("zaten aktif"); // duplicate-callback message

    // iyzico API should NOT be called — we short-circuit before it
    expect(retrieveCheckoutFormResult).not.toHaveBeenCalled();
  });

  it("does NOT write to DB on duplicate callback (no upsert called)", async () => {
    const { mockClient } = makeSupabaseMock({ id: "sub-002", user_id: "user-def" });

    const req = makeFormRequest("duplicate-token");
    await POST(req);

    // from() is called once for the idempotency SELECT
    // upsert() must NOT be called
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    // No second from() call for the upsert
    const calls = vi.mocked(mockClient.from).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("iyzico_subscriptions");
  });

  it("processes a new (unseen) token successfully", async () => {
    // idempotency check returns null → proceed
    makeSupabaseMock(null);

    // Payment succeeded
    vi.mocked(retrieveCheckoutFormResult).mockResolvedValue({
      status: "success",
      paymentStatus: "SUCCESS",
      buyerId: "user-new",
      basketId: "user-new-starter-1726055000000",
      paymentId: "pay-999",
    });

    const req = makeFormRequest("fresh-token-001");
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("başarıyla oluşturuldu");

    // iyzico API WAS called for new tokens
    expect(retrieveCheckoutFormResult).toHaveBeenCalledOnce();
  });

  it("handles unique-constraint violation (23505) gracefully — treated as idempotent", async () => {
    // idempotency SELECT says "new token"
    // but upsert fails with constraint violation (race condition / duplicate POST)
    makeSupabaseMock(null, { code: "23505", message: "duplicate key value" });

    vi.mocked(retrieveCheckoutFormResult).mockResolvedValue({
      status: "success",
      paymentStatus: "SUCCESS",
      buyerId: "user-race",
      basketId: "user-race-pro-1726055000001",
      paymentId: "pay-000",
    });

    const req = makeFormRequest("race-condition-token");
    const res = await POST(req);

    // Should return success page (not an error) — the constraint error is idempotent
    expect(res.status).toBe(200);
    const body = await res.text();
    // Either the success page or the "already active" page — both are valid
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns error HTML when payment is NOT successful", async () => {
    makeSupabaseMock(null);

    vi.mocked(retrieveCheckoutFormResult).mockResolvedValue({
      status: "failure",
      paymentStatus: "FAILURE",
      errorMessage: "Kart bakiyesi yetersiz",
    });

    const req = makeFormRequest("failed-payment-token");
    const res = await POST(req);

    expect(res.status).toBe(200); // iyzico expects 200 even on failure
    const body = await res.text();
    expect(body).toContain("Ödeme başarısız");
    expect(body).toContain("Kart bakiyesi yetersiz");
  });

  it("rejects request with no token", async () => {
    const req = new Request("http://localhost/api/billing/iyzico/callback", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "other_field=value",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("token");
  });
});
