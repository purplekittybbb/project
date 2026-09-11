import { describe, expect, it } from "vitest";
import { TrendyolAdapter, REPRESENTATIVE_TRENDYOL_FEES } from "../lib/adapters/trendyol";
import { HepsiburadaAdapter, REPRESENTATIVE_HEPSIBURADA_FEES } from "../lib/adapters/hepsiburada";
import { computeCommission } from "../lib/calc/commission";

const GROSS = 1200;

describe("TrendyolAdapter — category → commission", () => {
  const adapter = new TrendyolAdapter();

  function row(category: string) {
    return {
      orderId: "O-1",
      sku: "SKU-1",
      category,
      saleDate: "2026-06-15",
      units: 1,
      grossRevenue: GROSS,
      unitCost: 0,
      shipping: 0,
      returnRate: 0,
      adSpend: 0,
    };
  }

  it("missing category falls back to Diğer + defaultCommission, never throws", () => {
    expect(() => adapter.toCanonical("t", [row("")])).not.toThrow();
    const [tx] = adapter.toCanonical("t", [row("")]);
    expect(tx.category).toBe("Diğer");
    const expected = computeCommission(GROSS, {
      rate: REPRESENTATIVE_TRENDYOL_FEES.defaultCommission,
      basis: REPRESENTATIVE_TRENDYOL_FEES.commissionBasis,
      vatRate: REPRESENTATIVE_TRENDYOL_FEES.vatRate,
      commissionVatRate: REPRESENTATIVE_TRENDYOL_FEES.vatRate,
    });
    expect(tx.fees.commission).toBeCloseTo(expected.commission, 10);
    expect(tx.fees.vat).toBeCloseTo(expected.commissionVat, 10);
  });

  it("Elektronik/Kulaklık uses the Elektronik table rate (vat-excluded basis)", () => {
    const [tx] = adapter.toCanonical("t", [row("Elektronik/Kulaklık")]);
    expect(tx.category).toBe("Elektronik");
    const expected = computeCommission(GROSS, {
      rate: 0.12,
      basis: "vat-excluded",
      vatRate: 0.2,
      commissionVatRate: 0.2,
    });
    expect(tx.fees.commission).toBeCloseTo(expected.commission, 10);
    expect(tx.fees.commission).not.toBeCloseTo(
      computeCommission(GROSS, {
        rate: REPRESENTATIVE_TRENDYOL_FEES.defaultCommission,
        basis: "vat-excluded",
        vatRate: 0.2,
        commissionVatRate: 0.2,
      }).commission,
      5,
    );
  });
});

describe("HepsiburadaAdapter — VAT basis + category fallback", () => {
  const adapter = new HepsiburadaAdapter();

  function row(category: string) {
    return {
      orderId: "HB-1",
      sku: "SKU-1",
      category,
      saleDate: "2026-06-15",
      units: 1,
      grossRevenue: GROSS,
      unitCost: 0,
      shipping: 0,
      returnRate: 0,
      adSpend: 0,
    };
  }

  it("still uses vat-included (Adım 1) — commission on gross, no extra service VAT", () => {
    expect(REPRESENTATIVE_HEPSIBURADA_FEES.commissionBasis).toBe("vat-included");
    const [tx] = adapter.toCanonical("t", [row("Elektronik")]);
    // 1200 × 0.11 = 132; commissionVat = 0
    expect(tx.fees.commission).toBeCloseTo(132, 10);
    expect(tx.fees.vat).toBe(0);
  });

  it("missing category falls back to Diğer + defaultCommission 0.14, never throws", () => {
    expect(() => adapter.toCanonical("t", [row("")])).not.toThrow();
    const [tx] = adapter.toCanonical("t", [row("")]);
    expect(tx.category).toBe("Diğer");
    expect(tx.fees.commission).toBeCloseTo(GROSS * 0.14, 10);
    expect(tx.fees.vat).toBe(0);
  });
});
