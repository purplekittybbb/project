import { describe, expect, it } from "vitest";
import { calcGuestProfit } from "../../lib/tools/guest-profit-calc";

describe("calcGuestProfit", () => {
  it("computes positive net profit for healthy inputs on Trendyol", () => {
    const r = calcGuestProfit({
      marketplace: "trendyol",
      category: "Elektronik",
      salePrice: 500,
      unitCost: 150,
      shipping: 40,
      returnRatePercent: 3,
    });
    expect(r.netProfit).toBeGreaterThan(0);
    expect(r.isLoss).toBe(false);
    expect(r.breakdown.commission).toBeGreaterThan(0);
  });

  it("flags loss when costs exceed revenue", () => {
    const r = calcGuestProfit({
      marketplace: "hepsiburada",
      category: "Moda",
      salePrice: 100,
      unitCost: 120,
      shipping: 50,
      returnRatePercent: 10,
    });
    expect(r.isLoss).toBe(true);
  });

  it("includes N11 extra fees", () => {
    const r = calcGuestProfit({
      marketplace: "n11",
      category: "Elektronik",
      salePrice: 400,
      unitCost: 100,
      shipping: 30,
      returnRatePercent: 2,
    });
    expect(r.n11ExtraFees).toBeGreaterThan(0);
    expect(r.breakdown.extraFees).toBeGreaterThan(0);
  });
});
