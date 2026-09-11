/**
 * Net profit engine — the seller's REAL take-home after every hidden cost.
 *
 * Pure & deterministic (no I/O, no framework, no Date): the same inputs always
 * produce the same breakdown, so it is fully unit-testable and safe to reuse
 * from the dashboard, an API route, or a batch job alike.
 *
 * Operates at LINE level (a quantity of one SKU sold at a given gross amount),
 * mirroring the canonical Transaction so callers can feed either a single unit
 * (units = 1) or a whole order line by passing the corresponding totals.
 *
 * Formula (Aşama A financial core):
 *   netProfit = grossRevenue
 *             − commission − commissionVat        (marketplace, basis-aware)
 *             − paymentFees
 *             − shipping
 *             − returnRiskCost
 *             − adSpend
 *             − extraFees                          (e.g. N11 platform service fees)
 *             − packagingCost                      (box/filler/label per line)
 *             − cogs
 */

import { computeCommission, type CommissionRule } from "./commission";

export interface NetProfitInput {
  /** Gross (VAT-inclusive) revenue for this line. */
  grossRevenue: number;
  /** Total cost of goods for this line (unit cost × units). */
  cogs: number;
  /** Seller-borne outbound shipping for this line. */
  shipping: number;
  /** Advertising spend allocated to this line. */
  adSpend: number;
  /** Payment/settlement processing fee for this line (absolute amount). */
  paymentFees: number;
  /** Return rate for this SKU, 0..1. */
  returnRatePercent: number;
  /**
   * Multiplier applied to shipping when modelling a returned order's shipping
   * exposure (outbound + return leg). Defaults to 2 (round trip).
   */
  returnShippingMultiplier?: number;
  /** Resolved marketplace commission rule (rate + VAT basis). */
  commissionRule: CommissionRule;
  /** Any flat extra platform/service fees (e.g. N11). Defaults to 0. */
  extraFees?: number;
  /** Packaging cost for this line (box, filler, label). Defaults to 0. */
  packagingCost?: number;
}

export interface NetProfitBreakdown {
  commission: number;
  commissionVat: number;
  paymentFees: number;
  shipping: number;
  returnRiskCost: number;
  adSpend: number;
  extraFees: number;
  packaging: number;
  cogs: number;
}

export interface NetProfitResult {
  grossRevenue: number;
  /** Sum of every deduction line (breakdown fields). */
  totalDeductions: number;
  /** grossRevenue − totalDeductions. */
  netProfit: number;
  /** netProfit / grossRevenue × 100 (0 when there is no revenue). */
  netMarginPercent: number;
  /** True when the line loses money after the full waterfall. */
  isLoss: boolean;
  breakdown: NetProfitBreakdown;
}

/** Expected cost of returns for a line: return rate × (goods + shipping legs). */
export function computeReturnRiskCost(
  returnRatePercent: number,
  cogs: number,
  shipping: number,
  returnShippingMultiplier = 2,
): number {
  return returnRatePercent * (cogs + shipping * returnShippingMultiplier);
}

/** Compute the full net-profit waterfall for one line. */
export function computeNetProfit(input: NetProfitInput): NetProfitResult {
  const { commission, commissionVat } = computeCommission(input.grossRevenue, input.commissionRule);
  const returnRiskCost = computeReturnRiskCost(
    input.returnRatePercent,
    input.cogs,
    input.shipping,
    input.returnShippingMultiplier ?? 2,
  );
  const extraFees = input.extraFees ?? 0;
  const packaging = input.packagingCost ?? 0;

  const breakdown: NetProfitBreakdown = {
    commission,
    commissionVat,
    paymentFees: input.paymentFees,
    shipping: input.shipping,
    returnRiskCost,
    adSpend: input.adSpend,
    extraFees,
    packaging,
    cogs: input.cogs,
  };

  const totalDeductions =
    commission +
    commissionVat +
    input.paymentFees +
    input.shipping +
    returnRiskCost +
    input.adSpend +
    extraFees +
    packaging +
    input.cogs;

  const netProfit = input.grossRevenue - totalDeductions;
  const netMarginPercent = input.grossRevenue > 0 ? (netProfit / input.grossRevenue) * 100 : 0;

  return {
    grossRevenue: input.grossRevenue,
    totalDeductions,
    netProfit,
    netMarginPercent,
    isLoss: netProfit < 0,
    breakdown,
  };
}
