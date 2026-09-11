/**
 * Amazon TR adapter.
 *
 * Maps Amazon.tr (marketplaceId A33AVAJ2PDY3EV) order lines into canonical
 * Transactions. Fee math is delegated to lib/calc/commission.ts.
 *
 * SP-API / OAuth live in lib/amazon-sp-api — this file is the fee adapter only.
 *
 * Referral-fee basis (REPRESENTATIVE, pending Seller Central fee preview on
 * the first joint live account):
 *   Amazon TR/EU applies the referral % to VAT-INCLUDED proceeds, then levies
 *   service VAT on that fee → CommissionBasis "vat-included-plus-service-vat".
 *   Category rates below are mid-points from Amazon's published TR referral
 *   schedule, not a seller's live agreement.
 *
 * LIVE ORDERS: never fetched from here. See lib/amazon-sp-api/live.ts.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";
import { resolveCommissionRate } from "./marketplace-adapter";
import { computeCommission } from "../calc/commission";
import { mapToInternalCategory } from "../domain/internal-category";

export interface RawAmazonTrRow {
  orderId: string;
  sku: string;
  category: string;
  saleDate: string;
  units: number;
  grossRevenue: number; // TRY
  unitCost: number;
  fbaFee: number; // fulfilment / shipping, TRY
  returnRate: number;
  adSpend: number;
  packaging?: number;
}

/** Representative Amazon TR fee configuration. Verify against Seller Central. */
export const REPRESENTATIVE_AMAZON_TR_FEES: FeeConfig = {
  commissionTable: {
    "Ev & Yaşam": 0.15,
    "Elektronik": 0.08,
    "Moda": 0.15,
    "Kozmetik": 0.15,
    "Anne & Bebek": 0.15,
  },
  defaultCommission: 0.15,
  vatRate: 0.2,
  paymentFeeRate: 0,
  commissionBasis: "vat-included-plus-service-vat",
};

export class AmazonTrAdapter implements MarketplaceAdapter<RawAmazonTrRow> {
  readonly marketplace = "amazon_tr" as const;
  readonly currency = "TRY" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_AMAZON_TR_FEES) {}

  toCanonical(tenantId: string, raw: RawAmazonTrRow[]): Transaction[] {
    return raw.map((r) => {
      const category = mapToInternalCategory(r.category);
      const { commission, commissionVat: vat } = computeCommission(r.grossRevenue, {
        rate: resolveCommissionRate(this.fees, category),
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
        category,
        saleDate: r.saleDate,
        currency: this.currency,
        units: r.units,
        grossRevenue: r.grossRevenue,
        cogs,
        fees: {
          commission,
          vat,
          shipping: r.fbaFee,
          returnsAllocated,
          adSpendAllocated: r.adSpend,
          paymentFees: r.grossRevenue * this.fees.paymentFeeRate,
          packaging: r.packaging ?? 0,
        },
      };
    });
  }
}
