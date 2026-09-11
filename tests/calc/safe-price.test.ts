/**
 * Tests for lib/calc/safe-price.ts
 *
 * Coverage targets (100 % branch):
 *   computeSafePrice:
 *     B1a  commissionBasis === "vat-excluded"
 *     B1b  commissionBasis === "vat-included"
 *     B2a  feasible === true  (targetDenominator > 0)
 *     B2b  feasible === false (targetDenominator ≤ 0)
 *
 *   suggestBuyboxPrice:
 *     B3a  competitorPrice < floorPrice  → can't compete
 *     B3b  competitorPrice ≥ floorPrice, useTarget = true  (target achievable)
 *     B3c  competitorPrice ≥ floorPrice, useTarget = false, feasible=true
 *     B3d  competitorPrice ≥ floorPrice, useTarget = false, feasible=false
 *     B3e  suggestedPrice === 0  (zero-cost edge case, margin guard)
 *
 * Cross-validation tests verify that floor / target prices produce the
 * expected net profit when fed back into computeNetProfit.
 */

import { describe, it, expect } from "vitest";
import { computeSafePrice, suggestBuyboxPrice } from "../../lib/calc/safe-price";
import { computeNetProfit } from "../../lib/calc/net-profit";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Trendyol-representative commission rule (vat-excluded, 20% KDV). */
const TRENDYOL_RULE = {
  commissionRate: 0.15,
  commissionVatRate: 0.20,
  commissionBasis: "vat-excluded" as const,
  vatRate: 0.20,
};

/** Hepsiburada-representative commission rule (vat-included). */
const HEPSI_RULE = {
  commissionRate: 0.15,
  commissionVatRate: 0 as const,
  commissionBasis: "vat-included" as const,
  vatRate: 0.20,
};

/** Base cost profile shared across several tests. */
const BASE_COSTS = {
  unitCost: 40,
  shippingPerUnit: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// computeSafePrice
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSafePrice", () => {
  // B1a ─ vat-excluded (Trendyol/N11) floor price
  it("vat-excluded: floor price covers all costs at break-even (B1a + B2a)", () => {
    const result = computeSafePrice({ ...BASE_COSTS, ...TRENDYOL_RULE });

    // effectiveCommissionFraction = 0.15 × 1.20 / 1.20 = 0.15
    // fixedCostsPerUnit = 40 + 10 = 50
    // floorPrice = ceil(50 / (1 − 0.15)) = ceil(50 / 0.85) = ceil(58.82…) = 58.83
    expect(result.floorPrice).toBeCloseTo(58.83, 2);
    expect(result.effectiveCommissionFraction).toBeCloseTo(0.15, 5);
    expect(result.fixedCostsPerUnit).toBe(50);
    expect(result.feasible).toBe(true);
    expect(result.infeasibleReason).toBeUndefined();
  });

  // B1b ─ vat-included (Hepsiburada) floor price — same nominal rate → higher floor
  it("vat-included: floor price is HIGHER than vat-excluded for same rate (B1b + B2a)", () => {
    const trendyolResult = computeSafePrice({ ...BASE_COSTS, ...TRENDYOL_RULE });
    const hepsiResult    = computeSafePrice({ ...BASE_COSTS, ...HEPSI_RULE });

    // Hepsiburada: ecf = 0.15 (full gross price); floor = 50 / 0.85 = 58.83
    // Trendyol:    ecf = 0.15 × 1.20 / 1.20 = 0.15; SAME denominator here because
    //              commissionVatRate also = 0.20 → let's check with a case where they differ.
    // Use commissionVatRate = 0 for Trendyol to show the difference clearly.
    const trendyolNoVatResult = computeSafePrice({
      ...BASE_COSTS,
      commissionRate: 0.15,
      commissionVatRate: 0,   // no service VAT on commission
      commissionBasis: "vat-excluded",
      vatRate: 0.20,
    });

    // Trendyol (no service VAT): ecf = 0.15 / 1.20 = 0.125
    // floor = ceil(50 / 0.875) = ceil(57.14…) = 57.15
    expect(trendyolNoVatResult.floorPrice).toBeCloseTo(57.15, 2);
    expect(trendyolNoVatResult.effectiveCommissionFraction).toBeCloseTo(0.125, 5);

    // Hepsiburada: ecf = 0.15 (rate applied to full gross)
    // floor = ceil(50 / 0.85) = ceil(58.82…) = 58.83
    expect(hepsiResult.floorPrice).toBeCloseTo(58.83, 2);
    expect(hepsiResult.effectiveCommissionFraction).toBeCloseTo(0.15, 5);

    // Hepsiburada floor > Trendyol (no-service-VAT) floor
    expect(hepsiResult.floorPrice).toBeGreaterThan(trendyolNoVatResult.floorPrice);
  });

  it("target margin produces a higher price than floor price", () => {
    const noTarget = computeSafePrice({ ...BASE_COSTS, ...TRENDYOL_RULE, targetMarginPct: 0 });
    const withTarget = computeSafePrice({ ...BASE_COSTS, ...TRENDYOL_RULE, targetMarginPct: 20 });

    expect(withTarget.targetPrice).toBeGreaterThan(withTarget.floorPrice);
    expect(withTarget.targetPrice).toBeGreaterThan(noTarget.floorPrice);
    expect(withTarget.feasible).toBe(true);
    // targetPrice = floor(50 / (1 − 0.15 − 0.20)) = ceil(50 / 0.65) = ceil(76.92…) = 76.93
    expect(withTarget.targetPrice).toBeCloseTo(76.93, 2);
  });

  // B2b ─ infeasible target (commission + target margin ≥ 100%)
  it("returns infeasible when target margin + commission fraction ≥ 100% (B2b)", () => {
    const result = computeSafePrice({
      ...BASE_COSTS,
      commissionRate: 0.80,
      commissionVatRate: 0,
      commissionBasis: "vat-included",
      vatRate: 0,
      targetMarginPct: 30, // 80% + 30% = 110% > 100%
    });

    expect(result.feasible).toBe(false);
    expect(result.targetPrice).toBe(Infinity);
    expect(result.infeasibleReason).toMatch(/%30/);
    expect(result.infeasibleReason).toMatch(/%80/);
    // floor is still valid (ecf = 0.80, theoretical = 250.00)
    // ceilPrice may add ≤1 cent due to floating-point rounding of (1 − 0.80)
    expect(result.floorPrice).toBeGreaterThanOrEqual(250);
    expect(result.floorPrice).toBeLessThan(250.1);
  });

  it("optional cost fields all default to zero correctly", () => {
    const minimal = computeSafePrice({
      unitCost: 30,
      shippingPerUnit: 5,
      commissionRate: 0.10,
      commissionBasis: "vat-included",
      vatRate: 0,
    });

    // fixedCosts = 35, ecf = 0.10
    // floor = ceil(35 / 0.90) = ceil(38.88…) = 38.89
    expect(minimal.fixedCostsPerUnit).toBe(35);
    expect(minimal.floorPrice).toBeCloseTo(38.89, 2);
    expect(minimal.feasible).toBe(true);
  });

  it("packaging, adSpend, paymentFees, extraFees raise the floor price", () => {
    const base = computeSafePrice({
      unitCost: 30,
      shippingPerUnit: 5,
      commissionRate: 0.10,
      commissionBasis: "vat-included",
      vatRate: 0,
    });
    const withExtras = computeSafePrice({
      unitCost: 30,
      shippingPerUnit: 5,
      packagingPerUnit: 2,
      adSpendPerUnit: 3,
      paymentFeePerUnit: 1,
      extraFeesPerUnit: 1,
      commissionRate: 0.10,
      commissionBasis: "vat-included",
      vatRate: 0,
    });

    // Extra fixed costs = 7 → floor = ceil(42 / 0.90) = ceil(46.66…) = 46.67
    expect(withExtras.fixedCostsPerUnit).toBe(42);
    expect(withExtras.floorPrice).toBeGreaterThan(base.floorPrice);
  });

  it("return rate increases fixed costs and therefore the floor price", () => {
    const noReturn = computeSafePrice({ ...BASE_COSTS, ...TRENDYOL_RULE });
    const withReturn = computeSafePrice({
      ...BASE_COSTS,
      ...TRENDYOL_RULE,
      returnRate: 0.10,           // 10 %
      returnShippingMultiplier: 2, // round trip
    });

    // returnRiskCost = 0.10 × (40 + 10×2) = 0.10 × 60 = 6
    // fixedCosts = 50 + 6 = 56
    expect(withReturn.fixedCostsPerUnit).toBeCloseTo(56, 5);
    expect(withReturn.floorPrice).toBeGreaterThan(noReturn.floorPrice);
  });

  // Cross-validation: floor price fed into computeNetProfit must yield netProfit ≥ 0
  it("floor price cross-validates: computeNetProfit(floorPrice) gives netProfit ≥ 0", () => {
    const safe = computeSafePrice({
      unitCost: 40,
      shippingPerUnit: 10,
      packagingPerUnit: 3,
      adSpendPerUnit: 2,
      returnRate: 0.05,
      returnShippingMultiplier: 2,
      commissionRate: 0.15,
      commissionVatRate: 0.20,
      commissionBasis: "vat-excluded",
      vatRate: 0.20,
    });

    const netResult = computeNetProfit({
      grossRevenue: safe.floorPrice,
      cogs: 40,
      shipping: 10,
      adSpend: 2,
      paymentFees: 0,
      returnRatePercent: 0.05,
      returnShippingMultiplier: 2,
      commissionRule: { rate: 0.15, basis: "vat-excluded", vatRate: 0.20, commissionVatRate: 0.20 },
      packagingCost: 3,
    });

    // Floor price must yield ≥ 0 net profit (≤ 1 cent rounding slack)
    expect(netResult.netProfit).toBeGreaterThanOrEqual(-0.01);
    expect(netResult.isLoss).toBe(false);
  });

  // Cross-validation: target price must yield ≥ target margin (with rounding slack)
  it("target price cross-validates: actual margin ≥ targetMarginPct − ε", () => {
    const TARGET = 15;
    const safe = computeSafePrice({
      unitCost: 40,
      shippingPerUnit: 10,
      commissionRate: 0.12,
      commissionVatRate: 0,
      commissionBasis: "vat-included",
      vatRate: 0,
      targetMarginPct: TARGET,
    });

    const netResult = computeNetProfit({
      grossRevenue: safe.targetPrice,
      cogs: 40,
      shipping: 10,
      adSpend: 0,
      paymentFees: 0,
      returnRatePercent: 0,
      commissionRule: { rate: 0.12, basis: "vat-included", vatRate: 0, commissionVatRate: 0 },
    });

    // Actual margin must be ≥ TARGET (ceiling rounding may add a fraction of a cent)
    expect(netResult.netMarginPercent).toBeGreaterThanOrEqual(TARGET - 0.1);
  });

  it("Amazon US style (zero VAT, vat-excluded basis → ecf = commissionRate)", () => {
    const result = computeSafePrice({
      unitCost: 20,
      shippingPerUnit: 5,
      commissionRate: 0.15,
      commissionVatRate: 0,
      commissionBasis: "vat-excluded",
      vatRate: 0, // No VAT for US
    });

    // ecf = 0.15 × 1 / 1 = 0.15 (identical to vat-included with same rate)
    expect(result.effectiveCommissionFraction).toBeCloseTo(0.15, 5);
    // floor = ceil(25 / 0.85) = ceil(29.41…) = 29.42
    expect(result.floorPrice).toBeCloseTo(29.42, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// suggestBuyboxPrice
// ─────────────────────────────────────────────────────────────────────────────

describe("suggestBuyboxPrice", () => {
  const SAFE = computeSafePrice({
    unitCost: 40,
    shippingPerUnit: 10,
    commissionRate: 0.15,
    commissionVatRate: 0,
    commissionBasis: "vat-included",
    vatRate: 0,
    targetMarginPct: 20,
    // floor = ceil(50 / 0.85) = 58.83
    // target = ceil(50 / (0.85 − 0.20)) = ceil(50 / 0.65) = 76.93
  });

  // B3a ─ competitor cheaper than floor → can't compete
  it("returns canCompete=false and floor price when competitor is below floor (B3a)", () => {
    const result = suggestBuyboxPrice(SAFE, 55); // 55 < floorPrice (58.83)

    expect(result.canCompete).toBe(false);
    expect(result.suggestedPrice).toBe(SAFE.floorPrice);
    expect(result.expectedMarginPct).toBe(0);
    expect(result.pricingMode).toBe("floor");
  });

  // B3b ─ competitor ≥ floor, targetPrice ≤ competitor → use target
  it("suggests targetPrice when it fits within competitor price (B3b)", () => {
    const result = suggestBuyboxPrice(SAFE, 100); // 100 ≥ 76.93 (targetPrice)

    expect(result.canCompete).toBe(true);
    expect(result.suggestedPrice).toBe(SAFE.targetPrice);
    expect(result.pricingMode).toBe("target");
    // Margin at targetPrice ≈ 20 %
    expect(result.expectedMarginPct).toBeCloseTo(20, 0);
  });

  // B3c ─ competitor ≥ floor but < targetPrice → match competitor (feasible target exists)
  it("matches competitor price when target is above competitor price (B3c)", () => {
    const result = suggestBuyboxPrice(SAFE, 70); // 70 ≥ 58.83 but < 76.93

    expect(result.canCompete).toBe(true);
    expect(result.suggestedPrice).toBe(70);
    expect(result.pricingMode).toBe("competitor");
    // Margin at 70 TL: net = 70×(1−0.15) − 50 = 59.5 − 50 = 9.5 → 9.5/70 = 13.57%
    expect(result.expectedMarginPct).toBeGreaterThan(0);
    expect(result.expectedMarginPct).toBeLessThan(20);
  });

  // B3d ─ competitor ≥ floor, feasible=false → match competitor (no target exists)
  it("matches competitor price when target is infeasible (B3d)", () => {
    const infeasibleSafe = computeSafePrice({
      unitCost: 40,
      shippingPerUnit: 10,
      commissionRate: 0.50,
      commissionVatRate: 0,
      commissionBasis: "vat-included",
      vatRate: 0,
      targetMarginPct: 60, // 50% + 60% > 100% → infeasible
    });

    expect(infeasibleSafe.feasible).toBe(false);
    // floor = ceil(50 / 0.50) = 100
    expect(infeasibleSafe.floorPrice).toBeCloseTo(100, 2);

    const result = suggestBuyboxPrice(infeasibleSafe, 120); // above floor, target infeasible

    expect(result.canCompete).toBe(true);
    expect(result.suggestedPrice).toBe(120);
    expect(result.pricingMode).toBe("competitor");
  });

  // B3e ─ suggestedPrice = 0 (zero-cost, zero-commission product)
  it("returns expectedMarginPct = 0 when suggestedPrice is zero (B3e)", () => {
    const zeroSafe = computeSafePrice({
      unitCost: 0,
      shippingPerUnit: 0,
      commissionRate: 0,
      commissionBasis: "vat-included",
      vatRate: 0,
    });

    expect(zeroSafe.floorPrice).toBe(0);

    const result = suggestBuyboxPrice(zeroSafe, 0); // competitorPrice = 0 = floorPrice

    expect(result.canCompete).toBe(true);
    expect(result.suggestedPrice).toBe(0);
    expect(result.expectedMarginPct).toBe(0);
  });
});

describe("computeSafePrice — vat-included-plus-service-vat (Amazon TR)", () => {
  it("ecf = rate × (1 + commissionVatRate)", () => {
    const result = computeSafePrice({
      unitCost: 40,
      shippingPerUnit: 10,
      commissionRate: 0.15,
      commissionVatRate: 0.20,
      commissionBasis: "vat-included-plus-service-vat",
      vatRate: 0.20,
    });
    // ecf = 0.15 * 1.20 = 0.18
    expect(result.effectiveCommissionFraction).toBeCloseTo(0.18, 5);
    // floor = 50 / 0.82 ≈ 60.98
    expect(result.floorPrice).toBeCloseTo(60.98, 2);
  });
});
