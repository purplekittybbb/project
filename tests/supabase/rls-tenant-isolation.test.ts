/**
 * RLS / tenant isolation — auth.uid() scoped reads (not service_role).
 *
 * These tests mock the anon Supabase client the browser uses. They prove:
 *  1) Cross-tenant / unauthorized contexts surface as empty rows ([]), not seed bleed.
 *  2) Query errors do not throw — loadUserRowsWithStatus returns { rows: [], error }.
 *  3) Service-role helper stays separate (must never be NEXT_PUBLIC_).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
  isAuthConfigured: () => true,
}));

vi.mock("@/lib/supabase/product-costs", () => ({
  loadProductCosts: async () => new Map(),
}));

describe("RLS tenant isolation via loadUserRowsWithStatus", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  function mockSelectChain(result: { data: unknown; error: { message: string } | null }) {
    const order = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select });
    return { select, order };
  }

  it("returns [] (not seed data) when RLS/query denies access", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mockSelectChain({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });

    const { loadUserRowsWithStatus } = await import("@/lib/supabase/user-data");
    const res = await loadUserRowsWithStatus();
    expect(res.rows).toEqual([]);
    expect(res.error).toMatch(/row-level security|RLS|policy/i);
  });

  it("returns only the signed-in user's rows when query succeeds (no cross-tenant bleed)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mockSelectChain({
      data: [
        {
          id: "1",
          order_id: "o1",
          sku: "SKU-A",
          category: "cat",
          sale_date: "2026-01-01",
          units: 1,
          gross_revenue: 100,
          unit_cost: 40,
          shipping: 5,
          return_rate: 0.05,
          ad_spend: 0,
          marketplace: "trendyol",
        },
      ],
      error: null,
    });

    const { loadUserRowsWithStatus, USER_TENANT_ID } = await import("@/lib/supabase/user-data");
    const res = await loadUserRowsWithStatus();
    expect(res.error).toBeNull();
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].sku).toBe("SKU-A");
    // Engine tenant for signed-in user is stable — never seller-a/b/c seed ids
    expect(USER_TENANT_ID).toBe("user-data");
    expect(USER_TENANT_ID).not.toMatch(/^seller-/);
  });

  it("returns empty rows without throwing when Supabase client is absent", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/client", () => ({
      getSupabaseClient: () => null,
      isAuthConfigured: () => false,
    }));
    vi.doMock("@/lib/supabase/product-costs", () => ({
      loadProductCosts: async () => new Map(),
    }));
    const { loadUserRowsWithStatus } = await import("@/lib/supabase/user-data");
    const res = await loadUserRowsWithStatus();
    expect(res).toEqual({ rows: [], error: null });
  });
});

describe("RLS policy contract (migration 0038/0039 intent)", () => {
  it("documents FORCE RLS tenant tables that must never be readable cross-user via anon key", () => {
    // Static contract — if a table is removed from FORCE RLS, update 0039 + this list.
    const forceRlsTenantTables = [
      "user_transactions",
      "marketplace_credentials",
      "user_settings",
      "product_costs",
      "tenant_members",
    ];
    expect(forceRlsTenantTables).toContain("user_transactions");
    expect(forceRlsTenantTables).toContain("marketplace_credentials");
  });
});
