import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockBillingSelect = vi.fn();
const mockBillingUpsert = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table !== "billing_subscriptions") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => mockBillingSelect(),
          }),
        }),
        upsert: (row: unknown, opts: unknown) => mockBillingUpsert(row, opts),
      };
    },
  })),
}));

async function importRoute() {
  return import("../app/api/billing/start-demo-trial/route");
}

describe("POST /api/billing/start-demo-trial", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockBillingSelect.mockReset();
    mockBillingUpsert.mockReset();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    delete process.env.STRIPE_LIVE_ENABLED;
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockBillingSelect.mockResolvedValue({ data: null, error: null });
    mockBillingUpsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects when Stripe is live", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test";
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/billing/start-demo-trial", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      })
    );
    expect(res.status).toBe(503);
  });

  it("creates a demo trialing row for the signed-in user", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/billing/start-demo-trial", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("trialing");
    expect(body.isDemo).toBe(true);
    expect(mockBillingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        stripe_customer_id: "demo:user-1",
        stripe_subscription_id: null,
        status: "trialing",
      }),
      { onConflict: "user_id" }
    );
  });

  it("is idempotent when a trialing row already exists", async () => {
    mockBillingSelect.mockResolvedValue({
      data: {
        status: "trialing",
        trial_end: "2026-08-11T00:00:00.000Z",
        stripe_customer_id: "demo:user-1",
      },
      error: null,
    });
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/billing/start-demo-trial", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      })
    );
    const body = await res.json();
    expect(body.alreadyActive).toBe(true);
    expect(mockBillingUpsert).not.toHaveBeenCalled();
  });
});
