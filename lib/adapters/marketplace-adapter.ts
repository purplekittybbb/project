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
import type { CommissionBasis } from "../calc/commission";
import { mapToInternalCategory } from "../domain/internal-category";

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
  /**
   * Which price base this marketplace applies its commission rate to — the
   * single field that distinguishes Trendyol-type ("vat-excluded", commission
   * on the VAT-excluded price + a separate service VAT) from Hepsiburada-type
   * ("vat-included", commission on the gross price, service VAT embedded).
   * Commission math is delegated to lib/calc/commission.ts so this basis is
   * applied consistently and there is no duplicated/approximated formula.
   */
  commissionBasis: CommissionBasis;
}

/**
 * Look up the commission rate for a marketplace category string.
 * Unmapped / empty → defaultCommission. Never throws.
 */
export function resolveCommissionRate(fees: FeeConfig, category: string): number {
  const internal = mapToInternalCategory(category);
  return fees.commissionTable[internal] ?? fees.defaultCommission;
}
