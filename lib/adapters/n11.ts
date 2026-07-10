/**
 * N11 adapter.
 *
 * Maps rows from N11's real order export into canonical Transactions.
 *
 * NOTE: commission rates here are REPRESENTATIVE and config-driven. Public
 * sources (accounting/e-commerce blogs referencing N11's own rate sheet)
 * only gave a wide range ("~%5 and up, category-dependent") plus two flat
 * platform fees applied on top of the category commission: ~1% + VAT
 * "Pazarlama Hizmet Bedeli" and ~0.67% + VAT "Pazaryeri Hizmet Bedeli" — no
 * precise per-category table could be found. Those two flat fees (~1.67%
 * combined) are folded into paymentFeeRate below alongside a typical payment
 * processing cost. Verify all of this against the current N11 seller
 * agreement before any investor data room.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";

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
}

/** Representative N11 fee configuration. Verify before use. */
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
  // ~1.67% combined "Pazarlama" + "Pazaryeri Hizmet Bedeli" flat platform
  // fees + a typical payment processing cost (~1.3%).
  paymentFeeRate: 0.03,
};

export class N11Adapter implements MarketplaceAdapter<RawN11Row> {
  readonly marketplace = "n11" as const;
  readonly currency = "TRY" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_N11_FEES) {}

  private commissionRate(category: string): number {
    return this.fees.commissionTable[category] ?? this.fees.defaultCommission;
  }

  toCanonical(tenantId: string, raw: RawN11Row[]): Transaction[] {
    return raw.map((r) => {
      const commission = r.grossRevenue * this.commissionRate(r.category);
      const vat = commission * this.fees.vatRate;
      const paymentFees = r.grossRevenue * this.fees.paymentFeeRate;
      const cogs = r.unitCost * r.units;
      const returnsAllocated = r.returnRate * (cogs + r.shipping * 2);

      return {
        tenantId,
        marketplace: this.marketplace,
        orderId: r.orderId,
        sku: r.sku,
        category: r.category,
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
          paymentFees,
        },
      };
    });
  }
}
