import { describe, expect, it, beforeEach } from "vitest";
import { getSeller, getSellerChannels, registerRuntimeSeller, clearRuntimeSellers } from "../lib/engine";
import { buildUserSeller } from "../lib/supabase/user-data";

const TENANT = "test-n11-only-seller";

function n11Row(orderId: string) {
  return {
    order_id: orderId, sku: "SKU1", category: "Elektronik", sale_date: "2026-06-01",
    units: 10, gross_revenue: 10000, unit_cost: 4000, shipping: 200, return_rate: 0.05, ad_spend: 300,
    marketplace: "n11",
  };
}

describe("getSellerChannels — real channels regardless of client-only connection state", () => {
  beforeEach(() => clearRuntimeSellers());

  it("returns the marketplaces a runtime seller actually has transactions for", () => {
    const seller = buildUserSeller([n11Row("1"), n11Row("2")], TENANT)!;
    registerRuntimeSeller(seller, "Test seller");
    expect(getSellerChannels(TENANT)).toEqual(["n11"]);
  });

  it("returns an empty list for an unknown tenant", () => {
    expect(getSellerChannels("no-such-tenant")).toEqual([]);
  });
});

describe("getSeller — a channel with zero data for this seller never silently returns a different seller", () => {
  beforeEach(() => clearRuntimeSellers());

  it("an N11-only seller has no data on the (hardcoded default) trendyol channel", () => {
    const seller = buildUserSeller([n11Row("1"), n11Row("2")], TENANT)!;
    registerRuntimeSeller(seller, "Test seller");

    // This is exactly the case the dashboard must guard against: the initial
    // `channel` state defaults to "trendyol" regardless of what the signed-in
    // seller actually connected. getSeller must return undefined here (not a
    // different seller's data) — the dashboard's own fallback picks a real
    // channel or "combined" for THIS tenant instead of substituting seed data.
    expect(getSeller(TENANT, "trendyol")).toBeUndefined();
    expect(getSeller(TENANT, "n11")).toBeDefined();
    expect(getSeller(TENANT, "n11")?.tenantId).toBe(TENANT);
    expect(getSeller(TENANT, "combined")?.tenantId).toBe(TENANT);
  });
});
