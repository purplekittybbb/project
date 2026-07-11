import { describe, expect, it, beforeEach } from "vitest";
import {
  computeSettlementVerification,
  getCashFlowProjection,
  registerRuntimeSeller,
  clearRuntimeSellers,
  type FeeWaterfall,
} from "../lib/engine";
import { buildUserSeller } from "../lib/supabase/user-data";

const TENANT = "test-runtime-settlement";

function waterfall(overrides: Partial<FeeWaterfall> = {}): FeeWaterfall {
  return {
    grossRevenue: 100000,
    commission: 15000,
    vat: 2000,
    shipping: 3000,
    returnsAllocated: 2000,
    adSpendAllocated: 1000,
    paymentFees: 1000,
    cogs: 40000,
    netContribution: 36000,
    ...overrides,
  };
}

describe("settlement verification — no silent 0% gap for real users", () => {
  it("a seed tenant (seller-b) is flagged as real/modeled settlement data", () => {
    const s = computeSettlementVerification(waterfall(), "seller-b", "TRY", "Trendyol");
    expect(s.isRealSettlementData).toBe(true);
    expect(s.hasGap).toBe(true); // seller-b has a modeled 2.3% gap
  });

  it("a real signed-in user (no seed gap rate) is flagged NOT real settlement data, even though gap is 0", () => {
    const s = computeSettlementVerification(waterfall(), TENANT, "TRY", "Trendyol");
    expect(s.isRealSettlementData).toBe(false);
    expect(s.hasGap).toBe(false);
    expect(s.actualPayout).toBe(s.expectedPayout);
  });
});

describe("cash-flow projection — representative flag propagates to every entry", () => {
  beforeEach(() => clearRuntimeSellers());

  it("marks every entry for a real runtime seller as not-real-settlement-data", () => {
    const seller = buildUserSeller(
      [
        {
          order_id: "1", sku: "SKU1", category: "Elektronik", sale_date: "2024-01-05",
          units: 5, gross_revenue: 5000, unit_cost: 2000, shipping: 100, return_rate: 0.05, ad_spend: 100,
          marketplace: "trendyol",
        },
      ],
      TENANT
    )!;
    registerRuntimeSeller(seller, "Test seller");

    const entries = getCashFlowProjection(TENANT, "combined", "2025-01-01");
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.isRealSettlementData).toBe(false);
    }
  });

  it("marks every entry for a seed seller as real/modeled settlement data", () => {
    const entries = getCashFlowProjection("seller-b", "combined", "2025-01-01");
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.isRealSettlementData).toBe(true);
    }
  });
});
