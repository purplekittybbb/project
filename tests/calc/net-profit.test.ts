import { describe, expect, it } from "vitest";
import {
  computeNetProfit,
  computeReturnRiskCost,
  type NetProfitInput,
} from "../../lib/calc/net-profit";
import type { CommissionRule } from "../../lib/calc/commission";

const TRENDYOL_RULE: CommissionRule = {
  rate: 0.15,
  basis: "vat-excluded",
  vatRate: 0.2,
  commissionVatRate: 0.2,
};

function input(overrides: Partial<NetProfitInput> = {}): NetProfitInput {
  return {
    grossRevenue: 1200,
    cogs: 400,
    shipping: 50,
    adSpend: 30,
    paymentFees: 18,
    returnRatePercent: 0.05,
    commissionRule: TRENDYOL_RULE,
    ...overrides,
  };
}

describe("computeReturnRiskCost", () => {
  it("uses a round-trip (×2) shipping exposure by default", () => {
    // 0.1 × (400 + 50×2) = 0.1 × 500 = 50
    expect(computeReturnRiskCost(0.1, 400, 50)).toBeCloseTo(50, 10);
  });

  it("respects an explicit shipping multiplier", () => {
    // 0.1 × (400 + 50×1) = 45
    expect(computeReturnRiskCost(0.1, 400, 50, 1)).toBeCloseTo(45, 10);
  });
});

describe("computeNetProfit", () => {
  it("computes the full waterfall with the default return multiplier", () => {
    const r = computeNetProfit(input());
    // commission: base = 1200/1.2 = 1000 ⇒ 150; commissionVat = 30.
    expect(r.breakdown.commission).toBeCloseTo(150, 10);
    expect(r.breakdown.commissionVat).toBeCloseTo(30, 10);
    // returnRiskCost = 0.05 × (400 + 50×2) = 0.05 × 500 = 25.
    expect(r.breakdown.returnRiskCost).toBeCloseTo(25, 10);
    expect(r.breakdown.extraFees).toBe(0);
    expect(r.breakdown.packaging).toBe(0);
    // deductions = 150 + 30 + 18 + 50 + 25 + 30 + 0 + 0 + 400 = 703.
    expect(r.totalDeductions).toBeCloseTo(703, 10);
    // net = 1200 − 703 = 497.
    expect(r.netProfit).toBeCloseTo(497, 10);
    expect(r.netMarginPercent).toBeCloseTo((497 / 1200) * 100, 10);
    expect(r.isLoss).toBe(false);
  });

  it("honours a custom return shipping multiplier and extra platform fees", () => {
    const r = computeNetProfit(input({ returnShippingMultiplier: 1, extraFees: 12 }));
    // returnRiskCost = 0.05 × (400 + 50×1) = 22.5
    expect(r.breakdown.returnRiskCost).toBeCloseTo(22.5, 10);
    expect(r.breakdown.extraFees).toBe(12);
  });

  it("subtracts packaging cost as its own deduction line", () => {
    const base = computeNetProfit(input());
    const withPack = computeNetProfit(input({ packagingCost: 40 }));
    expect(withPack.breakdown.packaging).toBe(40);
    // packaging flows straight through to deductions and net profit.
    expect(withPack.totalDeductions).toBeCloseTo(base.totalDeductions + 40, 10);
    expect(withPack.netProfit).toBeCloseTo(base.netProfit - 40, 10);
  });

  it("flags a loss when deductions exceed revenue", () => {
    const r = computeNetProfit(input({ adSpend: 900 }));
    expect(r.netProfit).toBeLessThan(0);
    expect(r.isLoss).toBe(true);
  });

  it("reports a 0% margin when there is no revenue (avoids divide-by-zero)", () => {
    const r = computeNetProfit(input({ grossRevenue: 0, cogs: 0, shipping: 0, adSpend: 0, paymentFees: 0 }));
    expect(r.netMarginPercent).toBe(0);
    expect(r.grossRevenue).toBe(0);
  });
});
