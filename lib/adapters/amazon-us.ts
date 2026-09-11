/**
 * Amazon US adapter.
 *
 * Demonstrates the adapter pattern extending to a second marketplace and currency
 * with zero changes to the core engine. Amazon's fee shape differs (referral fee +
 * FBA fulfilment fee), but it maps into the same canonical FeeBreakdown.
 *
 * NOTE: rates are REPRESENTATIVE and config-driven. Verify against current Amazon
 * fee schedules before use.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";
import { computeCommission } from "../calc/commission";

export interface RawAmazonUsRow {
  orderId: string;
  sku: string;
  category: string;
  saleDate: string;
  units: number;
  grossRevenue: number; // USD
  unitCost: number; // USD, per unit
  fbaFee: number; // USD, fulfilment fee (maps to shipping)
  returnRate: number;
  adSpend: number; // USD, sponsored products, allocated
  packaging?: number; // USD, packaging cost for the line (box/filler/label)
}

/** Representative Amazon US fee configuration. Verify before use. */
export const REPRESENTATIVE_AMAZON_US_FEES: FeeConfig = {
  commissionTable: {
    Home: 0.15, // referral fee
    Electronics: 0.08,
    Apparel: 0.17,
    Beauty: 0.15,
  },
  defaultCommission: 0.15,
  vatRate: 0, // US has no VAT; sales tax handled separately
  paymentFeeRate: 0,
  // vatRate 0 makes the VAT-excluded base equal to the gross price, so the
  // referral fee is commission = gross × rate with no service VAT — unchanged
  // behaviour, delegated to lib/calc/commission.ts for a single source of truth.
  commissionBasis: "vat-excluded",
};

export class AmazonUsAdapter implements MarketplaceAdapter<RawAmazonUsRow> {
  readonly marketplace = "amazon_us" as const;
  readonly currency = "USD" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_AMAZON_US_FEES) {}

  private commissionRate(category: string): number {
    return this.fees.commissionTable[category] ?? this.fees.defaultCommission;
  }

  toCanonical(tenantId: string, raw: RawAmazonUsRow[]): Transaction[] {
    return raw.map((r) => {
      // Referral fee via the shared calc engine (vatRate 0 ⇒ base == gross).
      const { commission } = computeCommission(r.grossRevenue, {
        rate: this.commissionRate(r.category),
        basis: this.fees.commissionBasis,
        vatRate: this.fees.vatRate,
        commissionVatRate: this.fees.vatRate,
      });
      const cogs = r.unitCost * r.units;
      const returnsAllocated = r.returnRate * (cogs + r.fbaFee);

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
          vat: 0,
          shipping: r.fbaFee, // FBA fulfilment maps to shipping in canonical model
          returnsAllocated,
          adSpendAllocated: r.adSpend,
          paymentFees: 0,
          packaging: r.packaging ?? 0,
        },
      };
    });
  }
}
