/**
 * Commission calculation — marketplace-specific VAT basis.
 *
 * This is the single, framework-independent source of truth for how a
 * marketplace's category commission is computed. It exists because different
 * marketplaces apply the SAME nominal rate to DIFFERENT bases, which produces
 * real money differences that a single shared formula would silently get wrong:
 *
 *   - Trendyol-type ("vat-excluded"): the commission rate is applied to the
 *     VAT-EXCLUDED price, and a separate service-fee VAT is charged ON TOP of
 *     the commission.
 *         vatExcludedPrice = grossPrice / (1 + vatRate)
 *         commission       = vatExcludedPrice * rate
 *         commissionVat    = commission * commissionVatRate
 *
 *   - Hepsiburada-type ("vat-included"): the rate is applied to the gross
 *     (VAT-INCLUDED) price, and the commission's own VAT is already embedded —
 *     no separate service VAT is added.
 *         commission       = grossPrice * rate
 *         commissionVat    = 0
 *
 *   - Amazon TR-type ("vat-included-plus-service-vat"): the referral fee is
 *     applied to the gross (VAT-INCLUDED) proceeds, THEN a separate service
 *     tax is levied on that fee. Distinct from both formulas above.
 *         commission       = grossPrice * rate
 *         commissionVat    = commission * commissionVatRate
 *
 * Pure & deterministic: no Next.js request/response, no I/O, no Date, no
 * hard-coded currency or "KDV" string — the tax rate and basis are always
 * passed in as parameters, so the same function serves a future non-TR market
 * (e.g. a sales-tax country) by supplying a different rate/basis.
 */

/** Which price base a marketplace applies its commission rate to. */
export type CommissionBasis = "vat-excluded" | "vat-included" | "vat-included-plus-service-vat";

/**
 * A resolved commission rule for one (marketplace × category) at calc time.
 * The persisted/config form may carry more (validity window, country, source);
 * this is the minimal shape the pure calculation needs.
 */
export interface CommissionRule {
  /** Nominal commission rate, 0..1 (e.g. 0.12 for 12%). */
  rate: number;
  /** Which base the marketplace applies the rate to. */
  basis: CommissionBasis;
  /**
   * VAT/tax rate on the GOODS (e.g. 0.20 KDV), used to strip VAT out of a
   * gross price for a "vat-excluded" base. Ignored for "vat-included".
   */
  vatRate: number;
  /**
   * Tax rate levied on the commission SERVICE FEE itself (e.g. 0.20). Applied
   * for "vat-excluded" and "vat-included-plus-service-vat". A "vat-included"
   * base never adds it (the published rate already embeds the tax).
   */
  commissionVatRate: number;
}

export interface CommissionResult {
  /** Commission charged by the marketplace, excluding its own service VAT. */
  commission: number;
  /** VAT levied on the commission service fee (0 for a vat-included basis). */
  commissionVat: number;
  /** commission + commissionVat — the seller's total commission-side cost. */
  total: number;
}

const ZERO: CommissionResult = { commission: 0, commissionVat: 0, total: 0 };

/**
 * Compute the marketplace commission (and its service VAT) for one line's
 * gross (VAT-inclusive) selling amount, using the marketplace's own basis.
 */
export function computeCommission(grossPrice: number, rule: CommissionRule): CommissionResult {
  if (!(grossPrice > 0)) return { ...ZERO };

  if (rule.basis === "vat-excluded") {
    const vatExcludedPrice = grossPrice / (1 + rule.vatRate);
    const commission = vatExcludedPrice * rule.rate;
    const commissionVat = commission * rule.commissionVatRate;
    return { commission, commissionVat, total: commission + commissionVat };
  }

  if (rule.basis === "vat-included-plus-service-vat") {
    const commission = grossPrice * rule.rate;
    const commissionVat = commission * rule.commissionVatRate;
    return { commission, commissionVat, total: commission + commissionVat };
  }

  // "vat-included": rate applied to the gross price; commission VAT is already
  // embedded in that figure, so no separate service VAT is added.
  const commission = grossPrice * rule.rate;
  return { commission, commissionVat: 0, total: commission };
}
