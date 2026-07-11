import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockBillingSelect = vi.fn();

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
      };
    },
  })),
}));

async function importRoute() {
  return import("../app/api/billing/status/route");
}

describe("GET /api/billing/status", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockBillingSelect.mockReset();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockBillingSelect.mockResolvedValue({
      data: {
        status: "trialing",
        trial_end: "2026-08-11T00:00:00.000Z",
        stripe_subscription_id: "sub_1",
        stripe_customer_id: "cus_1",
        updated_at: "2026-07-11T00:00:00.000Z",
      },
      error: null,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects without Authorization", async () => {
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/billing/status"));
    expect(res.status).toBe(401);
  });

  it("returns subscription status for the signed-in user", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test";
    const { GET } = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/billing/status", {
        headers: { Authorization: "Bearer token" },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stripeConfigured).toBe(true);
    expect(body.subscription.status).toBe("trialing");
    expect(body.subscription.isDemo).toBe(false);
    expect(body.plan.currency).toBe("TRY");
  });

  it("marks demo subscriptions when stripe_customer_id uses demo prefix", async () => {
    mockBillingSelect.mockResolvedValue({
      data: {
        status: "trialing",
        trial_end: "2026-08-11T00:00:00.000Z",
        stripe_subscription_id: null,
        stripe_customer_id: "demo:user-1",
        updated_at: "2026-07-11T00:00:00.000Z",
      },
      error: null,
    });
    const { GET } = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/billing/status", {
        headers: { Authorization: "Bearer token" },
      })
    );
    const body = await res.json();
    expect(body.subscription.isDemo).toBe(true);
    expect(body.subscription.hasActiveSubscription).toBe(false);
  });

  it("returns null subscription when no row exists yet", async () => {
    mockBillingSelect.mockResolvedValue({ data: null, error: null });
    const { GET } = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/billing/status", {
        headers: { Authorization: "Bearer token" },
      })
    );
    const body = await res.json();
    expect(body.subscription).toBeNull();
  });
});

describe("marketplace catalogue honesty", () => {
  it("platforms without a real backend are marked coming_soon, not fake oauth/api_key", async () => {
    const { MARKETPLACE_OPTIONS } = await import("../lib/marketplaces");
    const comingSoonIds = ["pazarama", "ciceksepeti", "walmart", "ebay", "etsy", "woocommerce"];
    for (const id of comingSoonIds) {
      const opt = MARKETPLACE_OPTIONS.find((m) => m.id === id);
      expect(opt?.connectionMethod, id).toBe("coming_soon");
    }
    const liveApi = ["trendyol", "hepsiburada", "n11"];
    for (const id of liveApi) {
      expect(MARKETPLACE_OPTIONS.find((m) => m.id === id)?.connectionMethod).toBe("api_key");
    }
  });
});
