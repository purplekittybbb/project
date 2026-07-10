/**
 * Marketplace adapter pattern.
 *
 * Each marketplace has its own raw export shape. An adapter maps that raw shape into
 * the canonical Transaction model. The margin engine, underwriting and backtest only
 * ever see canonical data, so adding a new country/marketplace is a new adapter with
 * zero changes to the core. This is the architecture investors read as "built to
 * scale across markets."
 */

import type { Currency, Marketplace, Transaction } from "../domain/canonical";

export interface MarketplaceAdapter<Raw> {
  readonly marketplace: Marketplace;
  readonly currency: Currency;
  toCanonical(tenantId: string, raw: Raw[]): Transaction[];
}

/** Category -> commission rate (0..1). Representative; verify vs current agreement. */
export type CommissionTable = Record<string, number>;

/** VAT / KDV rate applied to the sale (Turkey standard = 0.20 at time of writing). */
export interface FeeConfig {
  commissionTable: CommissionTable;
  defaultCommission: number;
  vatRate: number;
  paymentFeeRate: number; // share of gross revenue
}
