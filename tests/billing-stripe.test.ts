import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const {
  mockGetUser,
  mockBillingSelect,
  mockBillingInsert,
  mockBillingUpsert,
  mockCustomersCreate,
  mockSetupIntentsCreate,
  mockSetupIntentsRetrieve,
  mockCustomersUpdate,
  mockSubscriptionsCreate,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockBillingSelect: vi.fn(),
  mockBillingInsert: vi.fn(),
  mockBillingUpsert: vi.fn(),
  mockCustomersCreate: vi.fn(),
  mockSetupIntentsCreate: vi.fn(),
  mockSetupIntentsRetrieve: vi.fn(),
  mockCustomersUpdate: vi.fn(),
  mockSubscriptionsCreate: vi.fn(),
}));

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
        insert: (row: unknown) => mockBillingInsert(row),
        upsert: (row: unknown, opts: unknown) => mockBillingUpsert(row, opts),
      };
    },
  })),
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    customers = { create: mockCustomersCreate, update: mockCustomersUpdate };
    setupIntents = { create: mockSetupIntentsCreate, retrieve: mockSetupIntentsRetrieve };
    subscriptions = { create: mockSubscriptionsCreate };
    constructor(_key: string) {}
  },
}));

async function importSetupIntentRoute() {
  return import("../app/api/billing/setup-intent/route");
}

async function importStartTrialRoute() {
  return import("../app/api/billing/start-trial/route");
}

function authedRequest(url: string, body?: unknown) {
  const init: RequestInit = {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  return new Request(url, init);
}

describe("POST /api/billing/setup-intent", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockBillingSelect.mockReset();
    mockBillingInsert.mockReset();
    mockCustomersCreate.mockReset();
    mockSetupIntentsCreate.mockReset();

    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_SECRET_KEY: "sk_test_x",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockBillingSelect.mockResolvedValue({ data: null, error: null });
    mockBillingInsert.mockResolvedValue({ error: null });
    mockCustomersCreate.mockResolvedValue({ id: "cus_test" });
    mockSetupIntentsCreate.mockResolvedValue({ client_secret: "seti_secret_test" });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { POST } = await importSetupIntentRoute();
    const res = await POST(authedRequest("http://localhost/api/billing/setup-intent"));
    expect(res.status).toBe(503);
  });

  it("rejects without Authorization", async () => {
    const { POST } = await importSetupIntentRoute();
    const res = await POST(new Request("http://localhost/api/billing/setup-intent", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns a SetupIntent client secret for a new customer", async () => {
    const { POST } = await importSetupIntentRoute();
    const res = await POST(authedRequest("http://localhost/api/billing/setup-intent"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.clientSecret).toBe("seti_secret_test");
    expect(mockCustomersCreate).toHaveBeenCalledOnce();
    expect(mockSetupIntentsCreate).toHaveBeenCalledOnce();
  });

  it("reuses an existing Stripe customer id", async () => {
    mockBillingSelect.mockResolvedValue({ data: { stripe_customer_id: "cus_existing" }, error: null });
    const { POST } = await importSetupIntentRoute();
    const res = await POST(authedRequest("http://localhost/api/billing/setup-intent"));
    expect(res.status).toBe(200);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSetupIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" })
    );
  });
});

describe("POST /api/billing/start-trial", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockBillingSelect.mockReset();
    mockBillingUpsert.mockReset();
    mockSetupIntentsRetrieve.mockReset();
    mockCustomersUpdate.mockReset();
    mockSubscriptionsCreate.mockReset();

    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_SECRET_KEY: "sk_test_x",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockBillingSelect.mockResolvedValue({ data: null, error: null });
    mockBillingUpsert.mockResolvedValue({ error: null });
    mockSetupIntentsRetrieve.mockResolvedValue({
      id: "seti_1",
      status: "succeeded",
      payment_method: "pm_1",
      customer: "cus_1",
      metadata: { supabase_user_id: "user-1" },
    });
    mockCustomersUpdate.mockResolvedValue({});
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      status: "trialing",
      trial_end: Math.floor(Date.now() / 1000) + 86400 * 30,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects missing setupIntentId", async () => {
    const { POST } = await importStartTrialRoute();
    const res = await POST(authedRequest("http://localhost/api/billing/start-trial", {}));
    expect(res.status).toBe(400);
  });

  it("creates a trialing subscription after a succeeded SetupIntent", async () => {
    const { POST } = await importStartTrialRoute();
    const res = await POST(
      authedRequest("http://localhost/api/billing/start-trial", { setupIntentId: "seti_1" })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("trialing");
    expect(mockSubscriptionsCreate).toHaveBeenCalledOnce();
    expect(mockBillingUpsert).toHaveBeenCalledOnce();
  });

  it("rejects a SetupIntent that belongs to another user", async () => {
    mockSetupIntentsRetrieve.mockResolvedValue({
      id: "seti_1",
      status: "succeeded",
      payment_method: "pm_1",
      customer: "cus_1",
      metadata: { supabase_user_id: "other-user" },
    });
    const { POST } = await importStartTrialRoute();
    const res = await POST(
      authedRequest("http://localhost/api/billing/start-trial", { setupIntentId: "seti_1" })
    );
    expect(res.status).toBe(403);
  });
});

describe("isStripeLiveEnabled", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is true when both Stripe keys are set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test";
    const { isStripeLiveEnabled } = await import("../lib/billing/is-stripe-live-enabled");
    expect(isStripeLiveEnabled()).toBe(true);
  });

  it("is false when keys are missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    delete process.env.STRIPE_LIVE_ENABLED;
    const { isStripeLiveEnabled } = await import("../lib/billing/is-stripe-live-enabled");
    expect(isStripeLiveEnabled()).toBe(false);
  });
});
