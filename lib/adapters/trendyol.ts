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
import { resolveCommissionRate } from "./marketplace-adapter";
import { computeCommission } from "../calc/commission";
import { mapToInternalCategory } from "../domain/internal-category";

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
  packaging?: number; // TRY, packaging cost for the line (box/filler/label)
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
  // Trendyol charges commission on the VAT-EXCLUDED price and adds a separate
  // service-fee VAT on top of the commission — see lib/calc/commission.ts.
  commissionBasis: "vat-excluded",
};

export class TrendyolAdapter implements MarketplaceAdapter<RawTrendyolRow> {
  readonly marketplace = "trendyol" as const;
  readonly currency = "TRY" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_TRENDYOL_FEES) {}

  toCanonical(tenantId: string, raw: RawTrendyolRow[]): Transaction[] {
    return raw.map((r) => {
      const category = mapToInternalCategory(r.category);
      // Commission math (VAT-excluded basis) is delegated to the pure calc
      // engine so the basis/VAT rule lives in exactly one place. VAT/KDV on the
      // goods is a pass-through (collected from buyer, remitted); the real
      // irrecoverable seller cost is the VAT levied on the marketplace
      // commission, returned here as commissionVat.
      const { commission, commissionVat: vat } = computeCommission(r.grossRevenue, {
        rate: resolveCommissionRate(this.fees, category),
        basis: this.fees.commissionBasis,
        vatRate: this.fees.vatRate,
        commissionVatRate: this.fees.vatRate,
      });
      const paymentFees = r.grossRevenue * this.fees.paymentFeeRate;
      const cogs = r.unitCost * r.units;
      // Returns allocated: a returned order still incurs COGS + shipping round-trip.
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
          paymentFees,
          packaging: r.packaging ?? 0,
        },
      };
    });
  }
}
