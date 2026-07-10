/**
 * Shopify adapter.
 *
 * Structurally different economics from a marketplace (Trendyol/Hepsiburada/N11):
 * Shopify is the seller's OWN storefront, not a marketplace that takes a
 * category-based sales commission. There is no "commissionTable" here — a
 * Shopify store owner keeps 100% of the sale price minus payment processing.
 * The only real, universal fee is Shopify Payments processing (~2.9% + a
 * fixed cents-per-transaction Shopify doesn't expose per-order via the
 * Orders API — approximated here as a flat percentage). VAT/KDV on a
 * commission doesn't apply (there is no commission to tax) — VAT is instead
 * whatever the merchant's own local tax setup charges the buyer, which is
 * not the seller's own cost and is out of scope for this fee waterfall,
 * same as it's out of scope for every other adapter here.
 *
 * NOTE: the payment processing rate is REPRESENTATIVE (Shopify Payments'
 * standard published rate). Verify against the store's actual plan/rate
 * before any investor data room — some stores pay lower blended rates at
 * higher volume tiers, and third-party payment gateways have their own fees.
 */

import type { Transaction } from "../domain/canonical";
import type { FeeConfig, MarketplaceAdapter } from "./marketplace-adapter";

export interface RawShopifyRow {
  orderId: string;
  sku: string;
  category: string;
  saleDate: string; // ISO
  units: number;
  grossRevenue: number; // store currency
  unitCost: number; // per unit
  shipping: number; // seller-borne
  returnRate: number; // 0..1 for this SKU
  adSpend: number; // already allocated to this SKU/order
}

/** Representative Shopify Payments fee configuration. Verify before use. */
export const REPRESENTATIVE_SHOPIFY_FEES: FeeConfig = {
  // No marketplace commission — a Shopify store is the seller's own site.
  commissionTable: {},
  defaultCommission: 0,
  vatRate: 0,
  // Shopify Payments standard online rate (representative — actual rate
  // depends on plan tier and card type; excludes the fixed per-transaction
  // cents component the Orders API doesn't expose).
  paymentFeeRate: 0.029,
};

export class ShopifyAdapter implements MarketplaceAdapter<RawShopifyRow> {
  readonly marketplace = "shopify" as const;
  // Simplification: the app's Currency type only supports TRY/USD, but a
  // real Shopify store can be set to any currency. USD is used as the
  // common default; a TRY-denominated store would need this widened before
  // its real numbers can be trusted.
  readonly currency = "USD" as const;

  constructor(private readonly fees: FeeConfig = REPRESENTATIVE_SHOPIFY_FEES) {}

  toCanonical(tenantId: string, raw: RawShopifyRow[]): Transaction[] {
    return raw.map((r) => {
      // No commission for a self-owned store.
      const commission = 0;
      const vat = 0;
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
