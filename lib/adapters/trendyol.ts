/**
 * Trendyol adapter.
 *
 * Maps rows from a Trendyol settlement/order export into canonical Transactions.
 * The raw row carries the seller-visible figures; the adapter computes the full fee
 * waterfall (commission from the category table, VAT, allocated returns and ad spend)
 * so downstream code sees a complete, normalized record.
 *
 * NOTE: commission rates and VAT here are REPRESENTATIVE and config-driven. Verify
 * against the current Trendyol seller agreement before any investor data room.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";

export interface RawTrendyolRow {
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

/** Representative Turkish marketplace fee configuration. Verify before use. */
export const REPRESENTATIVE_TRENDYOL_FEES: FeeConfig = {
  commissionTable: {
    "Ev & Yaşam": 0.15,
    "Elektronik": 0.12,
    "Moda": 0.2,
    "Kozmetik": 0.18,
    "Anne & Bebek": 0.16,
  },
  defaultCommission: 0.15,
  vatRate: 0.2,
  paymentFeeRate: 0.015,
};

export class TrendyolAdapter implements MarketplaceAdapter<RawTrendyolRow> {
  readonly marketplace = "trendyol" as const;
  readonly currency = "TRY" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_TRENDYOL_FEES) {}

  private commissionRate(category: string): number {
    return this.fees.commissionTable[category] ?? this.fees.defaultCommission;
  }

  toCanonical(tenantId: string, raw: RawTrendyolRow[]): Transaction[] {
    return raw.map((r) => {
      const commission = r.grossRevenue * this.commissionRate(r.category);
      // VAT/KDV on the goods is a pass-through (collected from buyer, remitted).
      // The real irrecoverable seller cost is VAT levied on the marketplace commission.
      const vat = commission * this.fees.vatRate;
      const paymentFees = r.grossRevenue * this.fees.paymentFeeRate;
      const cogs = r.unitCost * r.units;
      // Returns allocated: a returned order still incurs COGS + shipping round-trip.
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
