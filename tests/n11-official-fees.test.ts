/**
 * N11 official fee basis + documented extra deductions.
 *
 * Sources cited in lib/adapters/n11.ts:
 *   §6.3 KDV dahil satış fiyatı; table header "KDV Dahildir";
 *   pazarlama 1%+KDV, pazaryeri 0.67%+KDV, stopaj 1% KDV hariç.
 */
import { describe, expect, it } from "vitest";
import {
  N11Adapter,
  REPRESENTATIVE_N11_FEES,
  computeN11DocumentedExtraFees,
} from "@/lib/adapters/n11";
import { computeCommission } from "@/lib/calc/commission";
import { computeNetProfit } from "@/lib/calc/net-profit";
import { compareN11HakedisLine } from "@/lib/adapters/n11-hakedis";

describe("N11 official commission basis", () => {
  it("uses vat-included (KDV dahil satış fiyatı, oran KDV dahil)", () => {
    expect(REPRESENTATIVE_N11_FEES.commissionBasis).toBe("vat-included");
  });

  it("commission total equals gross × published rate (no extra service VAT)", () => {
    const res = computeCommission(1200, {
      rate: 0.10,
      basis: REPRESENTATIVE_N11_FEES.commissionBasis,
      vatRate: 0.2,
      commissionVatRate: 0.2,
    });
    expect(res.commission).toBeCloseTo(120, 10);
    expect(res.commissionVat).toBe(0);
    expect(res.total).toBeCloseTo(120, 10);
  });
});

describe("computeN11DocumentedExtraFees — official extra deductions", () => {
  it("matches the worked example: 1200 TL gross, 20% goods VAT", () => {
    const extras = computeN11DocumentedExtraFees(1200, 0.2);
    // pazarlama 1% + VAT = 12 * 1.2 = 14.4
    expect(extras.pazarlama).toBeCloseTo(14.4, 10);
    // pazaryeri 0.67% + VAT = 8.04 * 1.2 = 9.648
    expect(extras.pazaryeri).toBeCloseTo(9.648, 10);
    // stopaj 1% of 1000 = 10
    expect(extras.stopaj).toBeCloseTo(10, 10);
    expect(extras.total).toBeCloseTo(34.048, 10);
  });

  it("returns zeros for non-positive gross", () => {
    expect(computeN11DocumentedExtraFees(0, 0.2).total).toBe(0);
    expect(computeN11DocumentedExtraFees(-10, 0.2).total).toBe(0);
  });
});

describe("N11 adapter vs manual net-profit (±5%)", () => {
  it("Elektronik 1200 TL, maliyet 600, kargo 40 — engine within 5% of hand calc", () => {
    const adapter = new N11Adapter();
    const [tx] = adapter.toCanonical("t", [
      {
        orderId: "N11-VERIFY-1",
        sku: "SKU-E",
        category: "Elektronik",
        saleDate: "2026-09-01",
        units: 1,
        grossRevenue: 1200,
        unitCost: 600,
        shipping: 40,
        returnRate: 0,
        adSpend: 0,
      },
    ]);

    // Manual (official):
    // commission = 1200 * 0.10 = 120 (KDV dahil oran × KDV dahil fiyat)
    // extras     = 34.048
    // net        = 1200 - 120 - 34.048 - 40 - 600 = 405.952
    const manualNet = 405.952;
    const engineNet = tx.grossRevenue - tx.cogs
      - tx.fees.commission - tx.fees.vat
      - tx.fees.paymentFees - tx.fees.shipping
      - tx.fees.returnsAllocated - tx.fees.adSpendAllocated
      - (tx.fees.packaging ?? 0);

    expect(engineNet).toBeCloseTo(manualNet, 5);
    const pctDiff = Math.abs(engineNet - manualNet) / manualNet;
    expect(pctDiff).toBeLessThan(0.05);

    // Cross-check the shared net-profit engine with the same inputs.
    const np = computeNetProfit({
      grossRevenue: 1200,
      cogs: 600,
      shipping: 40,
      adSpend: 0,
      paymentFees: 0,
      extraFees: computeN11DocumentedExtraFees(1200, 0.2).total,
      returnRatePercent: 0,
      commissionRule: {
        rate: 0.10,
        basis: "vat-included",
        vatRate: 0.2,
        commissionVatRate: 0.2,
      },
    });
    expect(np.netProfit).toBeCloseTo(manualNet, 5);
  });
});

describe("compareN11HakedisLine — panel hakediş ±5%", () => {
  it("worked example payout 1200 − 120 − 34.048 = 1045.952 is within 5%", () => {
    const r = compareN11HakedisLine({
      grossRevenue: 1200,
      publishedCommissionRate: 0.10,
      panelPayout: 1045.952,
    });
    expect(r.commission).toBeCloseTo(120, 10);
    expect(r.extrasTotal).toBeCloseTo(34.048, 10);
    expect(r.enginePayout).toBeCloseTo(1045.952, 5);
    expect(r.within5Pct).toBe(true);
  });

  it("flags a panel payout that drifts more than 5%", () => {
    const r = compareN11HakedisLine({
      grossRevenue: 1200,
      publishedCommissionRate: 0.10,
      panelPayout: 800,
    });
    expect(r.within5Pct).toBe(false);
    expect(r.pctDiff).toBeGreaterThan(0.05);
  });
});
