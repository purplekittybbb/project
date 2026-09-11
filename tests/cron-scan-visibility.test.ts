/**
 * Tests for app/api/cron/scan-visibility/route.ts
 *
 * All external dependencies (Supabase, Playwright/browser session) are mocked.
 * No live network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock modules before any imports that use them ─────────────────────────────

vi.mock("@/lib/scrapers/browser", () => ({
  createBrowserSession: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => {
  const mockFrom = vi.fn();
  const mockClient = { from: mockFrom };
  return {
    createClient: vi.fn(() => mockClient),
    _mockFrom: mockFrom, // expose for test access
  };
});

vi.mock("@/lib/scrapers/visibility", () => ({
  searchProductRank: vi.fn(),
}));

vi.mock("@/lib/supabase/visibility-checks", () => ({
  insertVisibilityCheck: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/lib/supabase/shared-visibility", () => ({
  upsertSharedVisibilityScan: vi.fn().mockResolvedValue({ scanId: "shared-1", error: null }),
  ensureVisibilityWatch: vi.fn().mockResolvedValue({ error: null }),
  loadSharedLastScans: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/demand/queue", () => ({
  buildScanQueue: vi.fn().mockReturnValue([]),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  body: unknown,
  authHeader?: string
): Request {
  return new Request("http://localhost/api/cron/scan-visibility", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function parseJson(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/cron/scan-visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  // ── Auth check ───────────────────────────────────────────────────────────

  it("returns 401 when Authorization header is missing", async () => {
    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const req = makeRequest({ userId: "user-1", marketplace: "trendyol" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const req = makeRequest(
      { userId: "user-1", marketplace: "trendyol" },
      "Bearer wrong-secret"
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const req = makeRequest(
      { userId: "user-1", marketplace: "trendyol" },
      "Bearer anything"
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── Empty SKU list ───────────────────────────────────────────────────────

  it("returns { scanned: 0, found: 0, errors: [] } when user has no SKUs", async () => {
    // Mock Supabase to return empty transaction rows
    const { createClient } = await import("@supabase/supabase-js");
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const req = makeRequest(
      { userId: "user-1", marketplace: "trendyol" },
      "Bearer test-secret"
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.scanned).toBe(0);
    expect(body.found).toBe(0);
    expect(body.errors).toEqual([]);
  });

  // ── Browser session unavailable ──────────────────────────────────────────

  it("returns graceful error when browser session is unavailable", async () => {
    const { createClient } = await import("@supabase/supabase-js");

    const mockTxData = [
      {
        sku: "SKU-001",
        category: "Elektronik",
        gross_revenue: 1000,
        commission: 100,
        vat: 80,
        shipping: 30,
        returns_allocated: 20,
        ad_spend_allocated: 10,
        payment_fees: 5,
        packaging: 5,
        cogs: 500,
      },
    ];

    // Helper to build a deeply chainable mock that resolves with `resolvedValue`
    // after any number of chained .select()/.eq()/.in()/.order() calls.
    function makeChain(resolvedValue: { data: unknown; error: null | string }) {
      const chain: Record<string, unknown> = {};
      const methods = ["select", "eq", "in", "order"];
      for (const m of methods) {
        chain[m] = vi.fn().mockImplementation(() => {
          // Return a thenable so the chain can be awaited at any point
          const next = { ...chain };
          Object.assign(next, {
            then: (resolve: (v: typeof resolvedValue) => void, reject?: (e: Error) => void) =>
              Promise.resolve(resolvedValue).then(resolve, reject),
          });
          return next;
        });
      }
      chain.then = (resolve: (v: typeof resolvedValue) => void, reject?: (e: Error) => void) =>
        Promise.resolve(resolvedValue).then(resolve, reject);
      return chain;
    }

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "user_transactions") {
        return makeChain({ data: mockTxData, error: null });
      }
      // visibility_checks last-scan query
      return makeChain({ data: [], error: null });
    });

    vi.mocked(createClient).mockReturnValue({ from: fromMock } as never);

    // createBrowserSession returns null → browser unavailable
    const { createBrowserSession } = await import("@/lib/scrapers/browser");
    vi.mocked(createBrowserSession).mockResolvedValue(null);

    const { buildScanQueue } = await import("@/lib/demand/queue");
    vi.mocked(buildScanQueue).mockReturnValue([
      {
        sku: "SKU-001",
        marketplace: "trendyol",
        priorityScore: 20,
        reason: ["Hiç taranmamış (+20)"],
        scheduledAt: new Date(),
      },
    ]);

    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const req = makeRequest(
      { userId: "user-1", marketplace: "trendyol" },
      "Bearer test-secret"
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.scanned).toBe(0);
    expect(body.found).toBe(0);
    expect((body.errors as string[]).some((e: string) => e.includes("Browser session unavailable"))).toBe(true);
  });

  it("dual-writes shared scan + watch + visibility_checks on a successful scan", async () => {
    const { createClient } = await import("@supabase/supabase-js");

    const mockTxData = [
      {
        sku: "SKU-001",
        category: "Elektronik",
        gross_revenue: 1000,
        commission: 100,
        vat: 80,
        shipping: 30,
        returns_allocated: 20,
        ad_spend_allocated: 10,
        payment_fees: 5,
        packaging: 5,
        cogs: 500,
        product_name: "Bluetooth Kulaklık",
      },
    ];

    function makeChain(resolvedValue: { data: unknown; error: null | string }) {
      const chain: Record<string, unknown> = {};
      const methods = ["select", "eq", "in", "order"];
      for (const m of methods) {
        chain[m] = vi.fn().mockImplementation(() => {
          const next = { ...chain };
          Object.assign(next, {
            then: (resolve: (v: typeof resolvedValue) => void, reject?: (e: Error) => void) =>
              Promise.resolve(resolvedValue).then(resolve, reject),
          });
          return next;
        });
      }
      chain.then = (resolve: (v: typeof resolvedValue) => void, reject?: (e: Error) => void) =>
        Promise.resolve(resolvedValue).then(resolve, reject);
      return chain;
    }

    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "user_transactions") return makeChain({ data: mockTxData, error: null });
        return makeChain({ data: [], error: null });
      }),
    } as never);

    const { createBrowserSession } = await import("@/lib/scrapers/browser");
    vi.mocked(createBrowserSession).mockResolvedValue({
      page: {} as never,
      close: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { buildScanQueue } = await import("@/lib/demand/queue");
    vi.mocked(buildScanQueue).mockReturnValue([
      {
        sku: "SKU-001",
        marketplace: "trendyol",
        priorityScore: 20,
        reason: ["Hiç taranmamış (+20)"],
        scheduledAt: new Date(),
      },
    ]);

    const { searchProductRank } = await import("@/lib/scrapers/visibility");
    vi.mocked(searchProductRank).mockResolvedValue({
      found: true,
      rank: 4,
      page: 1,
      isIndexed: true,
      isOnFirstPage: true,
      results: [{ title: "Bluetooth Kulaklık", rank: 4, page: 1 }],
    } as never);

    const { insertVisibilityCheck } = await import("@/lib/supabase/visibility-checks");
    const { upsertSharedVisibilityScan, ensureVisibilityWatch, loadSharedLastScans } = await import("@/lib/supabase/shared-visibility");

    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const res = await POST(
      makeRequest({ userId: "user-1", marketplace: "trendyol" }, "Bearer test-secret"),
    );
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.scanned).toBe(1);
    expect(body.found).toBe(1);

    expect(loadSharedLastScans).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ marketplace: "trendyol", userId: "user-1", skus: ["SKU-001"] }),
    );
    expect(upsertSharedVisibilityScan).toHaveBeenCalledTimes(1);
    expect(ensureVisibilityWatch).toHaveBeenCalledTimes(1);
    expect(insertVisibilityCheck).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertVisibilityCheck).mock.calls[0][2]).toMatchObject({
      sku: "SKU-001",
      keyword: "Bluetooth Kulaklık",
      sharedScanId: "shared-1",
      rank: 4,
    });
  });

  // ── Unsupported marketplace ──────────────────────────────────────────────

  it("returns 400 for unsupported marketplace", async () => {
    const { createClient } = await import("@supabase/supabase-js");

    // For shopify, user_transactions will return some data, then we hit the marketplace check
    const mockTxData = [
      { sku: "SKU-1", category: "Cat", gross_revenue: 500, commission: 50, vat: 40,
        shipping: 20, returns_allocated: 10, ad_spend_allocated: 5, payment_fees: 3,
        packaging: 2, cogs: 250 },
    ];

    function makeChain(resolvedValue: { data: unknown; error: null | string }) {
      const chain: Record<string, unknown> = {};
      const methods = ["select", "eq", "in", "order"];
      for (const m of methods) {
        chain[m] = vi.fn().mockImplementation(() => {
          const next = { ...chain };
          Object.assign(next, {
            then: (resolve: (v: typeof resolvedValue) => void, reject?: (e: Error) => void) =>
              Promise.resolve(resolvedValue).then(resolve, reject),
          });
          return next;
        });
      }
      chain.then = (resolve: (v: typeof resolvedValue) => void, reject?: (e: Error) => void) =>
        Promise.resolve(resolvedValue).then(resolve, reject);
      return chain;
    }

    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "user_transactions") return makeChain({ data: mockTxData, error: null });
        return makeChain({ data: [], error: null });
      }),
    } as never);

    const { POST } = await import("@/app/api/cron/scan-visibility/route");
    const req = makeRequest(
      { userId: "user-1", marketplace: "shopify" },
      "Bearer test-secret"
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
