import { describe, expect, it, beforeEach } from "vitest";
import { getFinancing, registerRuntimeSeller, clearRuntimeSellers, LOW_SAMPLE_HISTORY_MONTHS } from "../lib/engine";
import { buildUserSeller } from "../lib/supabase/user-data";

const TENANT = "test-runtime-seller";

function rawRow(orderId: string, saleDate: string) {
  return {
    order_id: orderId, sku: "SKU1", category: "Elektronik", sale_date: saleDate,
    units: 5, gross_revenue: 5000, unit_cost: 2000, shipping: 100, return_rate: 0.05, ad_spend: 100,
    marketplace: "trendyol",
  };
}

describe("getFinancing — real signed-in seller (self-backtest)", () => {
  beforeEach(() => clearRuntimeSellers());

  it("a seed tenant (e.g. seller-b) still reports the 3-seller portfolio backtest, unchanged", () => {
    const fin = getFinancing("seller-b");
    expect(fin?.isSelfBacktest).toBe(false);
    expect(fin?.historyMonths).toBe(12);
  });

  it("returns undefined for a runtime tenant with no data registered", () => {
    expect(getFinancing(TENANT)).toBeUndefined();
  });

  it("a runtime seller with THIN history (1 month) is flagged self-backtest with a low historyMonths", () => {
    const seller = buildUserSeller([rawRow("1", "2024-01-05"), rawRow("2", "2024-01-20")], TENANT)!;
    registerRuntimeSeller(seller, "Test seller");

    const fin = getFinancing(TENANT);
    expect(fin?.isSelfBacktest).toBe(true);
    expect(fin?.historyMonths).toBe(1);
    expect(fin!.historyMonths).toBeLessThan(LOW_SAMPLE_HISTORY_MONTHS);
    // The backtest ran against THIS seller's own decision, not a seed portfolio.
    expect(fin?.report.trueMargin.decisions).toHaveLength(1);
    expect(fin?.report.trueMargin.decisions[0].tenantId).toBe(TENANT);
  });

  it("a runtime seller with enough history (>= LOW_SAMPLE_HISTORY_MONTHS months) is no longer low-sample", () => {
    const rows = Array.from({ length: LOW_SAMPLE_HISTORY_MONTHS }, (_, i) =>
      rawRow(String(i), `2024-${String(i + 1).padStart(2, "0")}-10`)
    );
    const seller = buildUserSeller(rows, TENANT)!;
    registerRuntimeSeller(seller, "Test seller");

    const fin = getFinancing(TENANT);
    expect(fin?.isSelfBacktest).toBe(true);
    expect(fin?.historyMonths).toBe(LOW_SAMPLE_HISTORY_MONTHS);
    expect(fin!.historyMonths).toBeGreaterThanOrEqual(LOW_SAMPLE_HISTORY_MONTHS);
  });

  it("the self-backtest's decision matches the standalone trueMarginModel decision shown elsewhere", () => {
    const seller = buildUserSeller([rawRow("1", "2024-01-05"), rawRow("2", "2024-02-05")], TENANT)!;
    registerRuntimeSeller(seller, "Test seller");

    const fin = getFinancing(TENANT);
    expect(fin?.decision.approvedLimit).toBe(fin?.report.trueMargin.decisions[0].approvedLimit);
    expect(fin?.incumbentDecision.approvedLimit).toBe(fin?.report.incumbent.decisions[0].approvedLimit);
  });
});
