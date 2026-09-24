import { describe, expect, it } from "vitest";
import { computeBreakEvenPrice, type FeeWaterfall } from "../lib/engine";

function waterfall(overrides: Partial<FeeWaterfall> = {}): FeeWaterfall {
  return {
    grossRevenue: 100,
    commission: 15,
    vat: 3,
    shipping: 10,
    returnsAllocated: 5,
    adSpendAllocated: 8,
    paymentFees: 2,
    packaging: 1,
    cogs: 40,
    netContribution: 16,
    ...overrides,
  };
}

/** At P_new, scale rate-based fees (commission, commission-VAT, payment) and keep fixed costs. */
function netAtPrice(w: FeeWaterfall, price: number): number {
  const p0 = w.grossRevenue;
  const scale = p0 > 0 ? price / p0 : 0;
  return (
    price -
    w.commission * scale -
    w.vat * scale -
    w.paymentFees * scale -
    w.shipping -
    w.returnsAllocated -
    w.adSpendAllocated -
    (w.packaging ?? 0) -
    w.cogs
  );
}

describe("computeBreakEvenPrice", () => {
  it("legacy formula underprices (documents the AD-12 bug direction)", () => {
    const w = waterfall();
    const commissionRate = w.commission / w.grossRevenue;
    const legacy = (w.cogs + w.shipping + w.paymentFees) / (1 - commissionRate);
    // Old: (40+10+2)/(1-0.15) ≈ 61.18 — below the true zero-profit price.
    expect(legacy).toBeCloseTo(61.176, 2);
    expect(netAtPrice(w, legacy)).toBeLessThan(-5);
  });

  it("puts rate fees in the denominator and fixed costs in the numerator", () => {
    const w = waterfall();
    const { breakEvenPrice, commissionRatePct } = computeBreakEvenPrice(w);
    // fixed = 40+10+5+8+1 = 64; rates = 0.15+0.03+0.02 = 0.20 → 64/0.80 = 80
    expect(breakEvenPrice).toBeCloseTo(80, 5);
    expect(commissionRatePct).toBeCloseTo(15, 5);
    expect(netAtPrice(w, breakEvenPrice)).toBeCloseTo(0, 5);
  });

  it("is higher than legacy whenever VAT/returns/ads/packaging are present", () => {
    const w = waterfall();
    const { breakEvenPrice } = computeBreakEvenPrice(w);
    const legacy = (w.cogs + w.shipping + w.paymentFees) / (1 - w.commission / w.grossRevenue);
    expect(breakEvenPrice).toBeGreaterThan(legacy);
  });

  it("returns Infinity when rate-based fees consume the whole price", () => {
    const w = waterfall({
      commission: 80,
      vat: 15,
      paymentFees: 10,
      grossRevenue: 100,
    });
    expect(computeBreakEvenPrice(w).breakEvenPrice).toBe(Infinity);
  });
});
