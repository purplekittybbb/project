/**
 * The new persistence layers (loss_alarms / profit_calc_history / product_costs,
 * migrations 0013–0015) must NEVER crash the live app before their migrations
 * are applied — they soft-fail. With no Supabase config in the test env,
 * getSupabaseClient() returns null and every function returns a safe default.
 */
import { describe, expect, it } from "vitest";
import { loadProductCosts, upsertProductCost, deleteProductCost } from "../lib/supabase/product-costs";
import {
  loadLossAlarms,
  recordLossAlarms,
  recordLossAlarmsForTransactions,
} from "../lib/supabase/loss-alarms";
import { loadProfitHistory, recordProfitCalc } from "../lib/supabase/profit-history";
import { loadMyWatchedVisibility } from "../lib/supabase/shared-visibility";
import type { Transaction } from "../lib/domain/canonical";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    tenantId: "t",
    marketplace: "trendyol",
    orderId: "o",
    sku: "SILENT",
    category: "Elektronik",
    saleDate: "2026-05-01",
    currency: "TRY",
    units: 10,
    grossRevenue: 1000,
    cogs: 700,
    fees: {
      commission: 100, vat: 0, shipping: 0, returnsAllocated: 0,
      adSpendAllocated: 250, paymentFees: 0,
    },
    ...overrides,
  };
}

describe("persistence layers — graceful when Supabase/tables are unavailable", () => {
  it("product costs read/write soft-fail (empty map / config error), never throw", async () => {
    expect((await loadProductCosts()).size).toBe(0);
    expect((await upsertProductCost("trendyol", "SKU", { unitCost: 100 })).error).toBeTruthy();
    expect((await deleteProductCost("trendyol", "SKU")).error).toBeTruthy();
  });

  it("loss alarm read/write soft-fail but detection still returns alarms", async () => {
    expect(await loadLossAlarms()).toEqual([]);
    expect((await recordLossAlarms("t", "trendyol", [])).recorded).toBe(0);

    // perceived = 1000 − 100 − 700 = 200 (>0) but true = 200 − 250 ad = −50 → silent loser.
    const res = await recordLossAlarmsForTransactions("t", "trendyol", [tx()]);
    expect(res.alarms.length).toBeGreaterThan(0);
    expect(res.alarms[0].level).toBe("silent-loss");
    expect(res.error).toBeTruthy(); // write soft-failed (no Supabase), but did not throw
    expect(res.recorded).toBe(0);
  });

  it("profit history read/write soft-fail, never throw", async () => {
    expect(await loadProfitHistory()).toEqual([]);
    const r = await recordProfitCalc({
      tenantId: "t", marketplace: "combined", currency: "TRY",
      grossRevenue: 1000, netProfit: 100, netMarginPct: 10, totalDeductions: 900,
    });
    expect(r.error).toBeTruthy();
  });

  it("watched visibility read soft-fails to [] without Supabase", async () => {
    expect(await loadMyWatchedVisibility()).toEqual([]);
  });
});
