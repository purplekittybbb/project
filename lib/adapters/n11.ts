/**
 * N11 adapter.
 *
 * Official fee basis (NOT a blog):
 *   SATICI İŞ ORTAKLIĞI ve ARACILIK HİZMETLERİ SÖZLEŞMESİ §6.3
 *   https://magazadestek.n11.com/s/kullanim-kosullari
 *     "malın KDV dahil satış fiyatı üzerinden alınacak komisyon bedelidir."
 *   Komisyon Oranları table header
 *   https://magazadestek.n11.com/s/komisyon-oranlari
 *     "Güncel Komisyon Oranları (KDV Dahildir)"
 *
 * Together: published rate already includes VAT, applied to VAT-INCLUDED
 * sale price → CommissionBasis "vat-included" (same family as Hepsiburada,
 * opposite of Trendyol's vat-excluded + separate service VAT).
 *
 * Extra documented deductions (Mağaza Destek SSS / para transfer):
 *   Pazarlama Hizmet Bedeli  = 1% of sale price + VAT on that fee
 *   Pazaryeri Hizmet Bedeli  = 0.67% of sale price + VAT on that fee
 *   Stopaj (7524)            = 1% of VAT-EXCLUDED product price
 *
 * Category rates below remain REPRESENTATIVE mid-points — the live sheet is
 * hundreds of leaf categories. Verify a seller's panel rate before an
 * investor data room. The BASIS and extra-fee formula are what this file
 * claims as sourced.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";
import { resolveCommissionRate } from "./marketplace-adapter";
import { computeCommission } from "../calc/commission";
import { mapToInternalCategory } from "../domain/internal-category";

export interface RawN11Row {
  orderId: string;
  sku: string;
  category: string;
  saleDate: string; // ISO
  units: number;
  grossRevenue: number; // TRY
  unitCost: number; // TRY, per unit
  shipping: number; // TRY, seller-borne
  returnRate: number; // 0..1 for this SKU
  adSpend: number; // TRY, already allocated to this SKU/order
  packaging?: number; // TRY, packaging cost for the line (box/filler/label)
}

/** Official extra-fee rates (fraction of the relevant base). */
export const N11_PAZARLAMA_RATE = 0.01;
export const N11_PAZARYERI_RATE = 0.0067;
export const N11_STOPAJ_RATE = 0.01;

export interface N11ExtraFees {
  pazarlama: number;
  pazaryeri: number;
  stopaj: number;
  total: number;
}

/**
 * Documented N11 extra deductions on one line's gross (VAT-included) price.
 * Assumption stated: pazarlama/pazaryeri "ürün bedeli" = KDV dahil satış
 * fiyatı (same commercial base as §6.3). Stopaj is explicitly KDV hariç.
 */
export function computeN11DocumentedExtraFees(gross: number, vatRate: number): N11ExtraFees {
  if (!(gross > 0) || !(vatRate >= 0)) {
    return { pazarlama: 0, pazaryeri: 0, stopaj: 0, total: 0 };
  }
  const pazarlama = gross * N11_PAZARLAMA_RATE * (1 + vatRate);
  const pazaryeri = gross * N11_PAZARYERI_RATE * (1 + vatRate);
  const stopaj = (gross / (1 + vatRate)) * N11_STOPAJ_RATE;
  return { pazarlama, pazaryeri, stopaj, total: pazarlama + pazaryeri + stopaj };
}

export const REPRESENTATIVE_N11_FEES: FeeConfig = {
  commissionTable: {
    "Ev & Yaşam": 0.13,
    "Elektronik": 0.10,
    "Moda": 0.18,
    "Kozmetik": 0.16,
    "Anne & Bebek": 0.14,
  },
  defaultCommission: 0.13,
  vatRate: 0.2,
  // Extra platform fees are computed by computeN11DocumentedExtraFees, not
  // folded into this rate (the old 0.03 mixed documented fees with an
  // invented ~1.3% payment-processing guess).
  paymentFeeRate: 0,
  commissionBasis: "vat-included",
};

export class N11Adapter implements MarketplaceAdapter<RawN11Row> {
  readonly marketplace = "n11" as const;
  readonly currency = "TRY" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_N11_FEES) {}

  toCanonical(tenantId: string, raw: RawN11Row[]): Transaction[] {
    return raw.map((r) => {
      const category = mapToInternalCategory(r.category);
      const { commission, commissionVat: vat } = computeCommission(r.grossRevenue, {
        rate: resolveCommissionRate(this.fees, category),
        basis: this.fees.commissionBasis,
        vatRate: this.fees.vatRate,
        commissionVatRate: this.fees.vatRate,
      });
      const extras = computeN11DocumentedExtraFees(r.grossRevenue, this.fees.vatRate);
      const cogs = r.unitCost * r.units;
      const returnsAllocated = r.returnRate * (cogs + r.shipping * 2);

      return {
        tenantId,
        marketplace: this.marketplace,
        orderId: r.orderId,
        sku: r.sku,
        category,
        saleDate: r.saleDate,
        currency: this.currency,
        units: r.units,
        grossRevenue: r.grossRevenue,
        cogs,
        fees: {
          commission,
          vat,
          shipping: r.shipping,
          returnsAllocated,
          adSpendAllocated: r.adSpend,
          paymentFees: extras.total,
          packaging: r.packaging ?? 0,
        },
      };
    });
  }
}
