import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/canonical.js";
import {
  computePerceivedMargin,
  computeTrueMargin,
  perSkuMargins,
} from "../src/domain/margin-engine.js";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tenantId: "t",
    marketplace: "trendyol",
    orderId: "o",
    sku: "SKU",
    category: "Ev & Yaşam",
    saleDate: "2026-05-01",
    currency: "TRY",
    units: 100,
    grossRevenue: 100000,
    cogs: 40000,
    fees: {
      commission: 15000,
      vat: 20000,
      shipping: 5000,
      returnsAllocated: 3000,
      adSpendAllocated: 12000,
      paymentFees: 1500,
    },
    ...overrides,
  };
}

describe("margin engine", () => {
  it("perceived margin ignores everything but commission and cogs", () => {
    const r = computePerceivedMargin(tx({}));
    // 100000 - 15000 commission - 40000 cogs = 45000 -> 45%
    expect(r.netContribution).toBe(45000);
    expect(r.marginPct).toBeCloseTo(45, 5);
  });

  it("true margin subtracts the full fee waterfall", () => {
    const r = computeTrueMargin(tx({}));
    // fees total = 15000+20000+5000+3000+12000+1500 = 56500
    // 100000 - 56500 - 40000 = 3500 -> 3.5%
    expect(r.totalFees).toBe(56500);
    expect(r.netContribution).toBe(3500);
    expect(r.marginPct).toBeCloseTo(3.5, 5);
  });

  it("the reveal: a SKU can look profitable perceived but be a silent loser true", () => {
    const heavyAd = tx({ fees: { commission: 15000, vat: 20000, shipping: 5000, returnsAllocated: 8000, adSpendAllocated: 25000, paymentFees: 1500 } });
    const perceived = computePerceivedMargin(heavyAd).marginPct;
    const trueM = computeTrueMargin(heavyAd).marginPct;
    expect(perceived).toBeGreaterThan(0); // looks fine
    expect(trueM).toBeLessThan(0); // actually loss-making
  });

  it("per-SKU view flags silent losers and sorts by gap", () => {
    const rows = perSkuMargins([
      tx({ sku: "GOOD", fees: { commission: 15000, vat: 20000, shipping: 4000, returnsAllocated: 2000, adSpendAllocated: 5000, paymentFees: 1500 } }),
      tx({ sku: "BAD", fees: { commission: 15000, vat: 20000, shipping: 6000, returnsAllocated: 9000, adSpendAllocated: 28000, paymentFees: 1500 } }),
    ]);
    const bad = rows.find((r) => r.sku === "BAD")!;
    expect(bad.isSilentLoser).toBe(true);
    expect(rows[0].sku).toBe("BAD"); // largest gap first
  });
});
