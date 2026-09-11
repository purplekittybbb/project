import { describe, expect, it } from "vitest";
import {
  computeCommission,
  type CommissionRule,
} from "../../lib/calc/commission";
import { REPRESENTATIVE_TRENDYOL_FEES } from "../../lib/adapters/trendyol";
import { REPRESENTATIVE_HEPSIBURADA_FEES } from "../../lib/adapters/hepsiburada";

function ruleFromFees(
  fees: { commissionBasis: "vat-excluded" | "vat-included" | "vat-included-plus-service-vat"; vatRate: number },
  rate: number,
): CommissionRule {
  return {
    rate,
    basis: fees.commissionBasis,
    vatRate: fees.vatRate,
    commissionVatRate: fees.vatRate,
  };
}

describe("computeCommission — VAT basis", () => {
  it("vat-excluded: commission on the VAT-excluded price + separate service VAT (Trendyol-type)", () => {
    // gross 120, KDV 20% ⇒ VAT-excluded base = 100. rate 10% ⇒ commission = 10.
    // service VAT on the commission = 10 × 20% = 2.
    const res = computeCommission(120, {
      rate: 0.1,
      basis: "vat-excluded",
      vatRate: 0.2,
      commissionVatRate: 0.2,
    });
    expect(res.commission).toBeCloseTo(10, 10);
    expect(res.commissionVat).toBeCloseTo(2, 10);
    expect(res.total).toBeCloseTo(12, 10);
  });

  it("Hepsiburada adapter fees still declare vat-included (Adım 1)", () => {
    expect(REPRESENTATIVE_HEPSIBURADA_FEES.commissionBasis).toBe("vat-included");
  });

  it("vat-included: commission on the gross price, no separate service VAT (Hepsiburada-type)", () => {
    // gross 120, rate 10% ⇒ commission = 12, commissionVat = 0.
    const res = computeCommission(120, {
      rate: 0.1,
      basis: "vat-included",
      vatRate: 0.2,
      commissionVatRate: 0.2,
    });
    expect(res.commission).toBeCloseTo(12, 10);
    expect(res.commissionVat).toBe(0);
    expect(res.total).toBeCloseTo(12, 10);
  });

  it("returns zeros for a non-positive gross price", () => {
    expect(computeCommission(0, {
      rate: 0.1,
      basis: "vat-excluded",
      vatRate: 0.2,
      commissionVatRate: 0.2,
    })).toEqual({ commission: 0, commissionVat: 0, total: 0 });

    expect(computeCommission(-50, {
      rate: 0.1,
      basis: "vat-included",
      vatRate: 0.2,
      commissionVatRate: 0.2,
    })).toEqual({ commission: 0, commissionVat: 0, total: 0 });
  });
});

describe("Section 2 critical fix — Trendyol vs Hepsiburada differ for the SAME gross + nominal rate", () => {
  const GROSS = 1200;
  const RATE = 0.15;

  it("produces DIFFERENT commission amounts because of the VAT basis", () => {
    const trendyol = computeCommission(GROSS, ruleFromFees(REPRESENTATIVE_TRENDYOL_FEES, RATE));
    const hepsiburada = computeCommission(GROSS, ruleFromFees(REPRESENTATIVE_HEPSIBURADA_FEES, RATE));

    // Trendyol (vat-excluded): base = 1200 / 1.2 = 1000 ⇒ commission = 150.
    expect(trendyol.commission).toBeCloseTo(150, 10);
    // Hepsiburada (vat-included): commission = 1200 × 0.15 = 180.
    expect(hepsiburada.commission).toBeCloseTo(180, 10);

    // The whole point of the fix: they must NOT be equal.
    expect(trendyol.commission).not.toBeCloseTo(hepsiburada.commission, 5);
    expect(trendyol.commission).toBeLessThan(hepsiburada.commission);
  });

  it("fixture bases are wired correctly (Trendyol vat-excluded, Hepsiburada vat-included)", () => {
    expect(REPRESENTATIVE_TRENDYOL_FEES.commissionBasis).toBe("vat-excluded");
    expect(REPRESENTATIVE_HEPSIBURADA_FEES.commissionBasis).toBe("vat-included");
  });

  it("Trendyol adds a service VAT on the commission; Hepsiburada does not", () => {
    const trendyol = computeCommission(GROSS, ruleFromFees(REPRESENTATIVE_TRENDYOL_FEES, RATE));
    const hepsiburada = computeCommission(GROSS, ruleFromFees(REPRESENTATIVE_HEPSIBURADA_FEES, RATE));
    expect(trendyol.commissionVat).toBeGreaterThan(0);
    expect(hepsiburada.commissionVat).toBe(0);
  });
});

describe("computeCommission — vat-included-plus-service-vat (Amazon TR)", () => {
  it("applies the rate to gross, then adds service VAT on the fee", () => {
    const res = computeCommission(1200, {
      rate: 0.15,
      basis: "vat-included-plus-service-vat",
      vatRate: 0.2,
      commissionVatRate: 0.2,
    });
    expect(res.commission).toBeCloseTo(180, 10);
    expect(res.commissionVat).toBeCloseTo(36, 10);
    expect(res.total).toBeCloseTo(216, 10);
  });

  it("is strictly larger than vat-included for the same rate (service VAT is extra)", () => {
    const included = computeCommission(1200, {
      rate: 0.15, basis: "vat-included", vatRate: 0.2, commissionVatRate: 0.2,
    });
    const plus = computeCommission(1200, {
      rate: 0.15, basis: "vat-included-plus-service-vat", vatRate: 0.2, commissionVatRate: 0.2,
    });
    expect(plus.total).toBeGreaterThan(included.total);
  });
});
