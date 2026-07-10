/**
 * Hepsiburada adapter.
 *
 * Third connector on the same canonical model — the concrete proof that the
 * connector/adapter architecture generalizes across marketplaces with zero core
 * changes. This is also the category's #1 risk mitigation from the investor memo:
 * platform dependency (a single marketplace, e.g. Trendyol, launching its own
 * seller-credit product) is reduced by owning a platform-independent, multi-source
 * view of the seller's real economics.
 *
 * NOTE: rates are REPRESENTATIVE and config-driven. Verify against current
 * Hepsiburada seller agreement before any investor data room.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";

export interface RawHepsiburadaRow {
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

/** Representative Hepsiburada fee configuration. Verify before use. */
export const REPRESENTATIVE_HEPSIBURADA_FEES: FeeConfig = {
  commissionTable: {
    "Ev & Yaşam": 0.14,
    "Elektronik": 0.11,
    "Moda": 0.19,
    "Kozmetik": 0.17,
    "Anne & Bebek": 0.15,
  },
  defaultCommission: 0.14,
  vatRate: 0.2,
  paymentFeeRate: 0.012,
};

export class HepsiburadaAdapter implements MarketplaceAdapter<RawHepsiburadaRow> {
  readonly marketplace = "hepsiburada" as const;
  readonly currency = "TRY" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_HEPSIBURADA_FEES) {}

  private commissionRate(category: string): number {
    return this.fees.commissionTable[category] ?? this.fees.defaultCommission;
  }

  toCanonical(tenantId: string, raw: RawHepsiburadaRow[]): Transaction[] {
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
