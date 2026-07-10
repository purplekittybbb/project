import { describe, expect, it } from "vitest";
import type { UnderwritingInputs } from "../lib/domain/canonical";
import { trueMarginModel } from "../lib/domain/underwriting";
import { runBacktest, type BacktestSeller } from "../lib/domain/backtest";
import { seededBacktestSellers } from "../lib/data/seed";

function inputs(overrides: Partial<UnderwritingInputs>): UnderwritingInputs {
  return {
    trueMarginPct: 25,
    trailingMonthlyContribution: 50000,
    monthlyRevenue: 200000,
    revenueVolatility: 0.1,
    stockVelocity: 300,
    returnRate: 0.05,
    tenureMonths: 24,
    ...overrides,
  };
}

describe("underwriting model", () => {
  it("prices a high-true-margin seller better than a thin-margin one at equal revenue", () => {
    const strong = trueMarginModel("s", inputs({ trueMarginPct: 30 }), "TRY");
    const thin = trueMarginModel("t", inputs({ trueMarginPct: 6, trailingMonthlyContribution: 12000 }), "TRY");
    expect(strong.takeRate).toBeLessThan(thin.takeRate);
  });

  it("keeps take rate inside the 3-6% band", () => {
    const d = trueMarginModel("s", inputs({ trueMarginPct: 4, returnRate: 0.2, tenureMonths: 3 }), "TRY");
    expect(d.takeRate).toBeGreaterThanOrEqual(0.03);
    expect(d.takeRate).toBeLessThanOrEqual(0.06);
  });

  it("produces an explainable rationale for every decision", () => {
    const d = trueMarginModel("s", inputs({}), "TRY");
    expect(d.rationale.length).toBeGreaterThan(0);
    expect(d.modelVersion).toContain("truemargin");
  });
});

describe("backtest", () => {
  it("true-margin model charges off less than the revenue-snapshot incumbent", () => {
    const sellers: BacktestSeller[] = [
      { tenantId: "thin", currency: "TRY", inputs: inputs({ trueMarginPct: 5, trailingMonthlyContribution: 10000, monthlyRevenue: 200000 }) },
      { tenantId: "ok", currency: "TRY", inputs: inputs({ trueMarginPct: 22, trailingMonthlyContribution: 44000, monthlyRevenue: 200000 }) },
    ];
    const report = runBacktest(sellers);
    expect(report.trueMargin.chargeOffRate).toBeLessThan(report.incumbent.chargeOffRate);
    expect(report.lossReductionPct).toBeGreaterThan(0);
  });

  it("runs end-to-end on the seeded sellers and beats the incumbent", () => {
    const report = runBacktest(seededBacktestSellers());
    expect(report.trueMargin.deployed).toBeGreaterThan(0);
    expect(report.trueMargin.totalLoss).toBeLessThanOrEqual(report.incumbent.totalLoss);
  });
});
