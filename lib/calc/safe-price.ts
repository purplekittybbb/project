/**
 * Safe-price / buybox solver — answers two questions:
 *
 *   1. "What is the MINIMUM price at which I still make money?" (floor price)
 *   2. "Should I match this competitor price, and at what margin?" (buybox)
 *
 * This is the INVERSE of computeNetProfit: instead of
 *   grossRevenue → netProfit
 * it solves for:
 *   desiredNetProfitMarginPct → grossRevenue (= safe listing price)
 *
 * Closed-form derivation (no iteration needed):
 *
 *   Let P   = gross (VAT-inclusive) listing price
 *       ecf = effectiveCommissionFraction  (see below)
 *       F   = fixedCostsPerUnit            (all non-commission per-unit costs)
 *
 *   netProfit = P − P·ecf − F = P·(1 − ecf) − F
 *
 *   Floor price  (netProfit = 0):
 *     P = F / (1 − ecf)
 *
 *   Target price (netProfit/P = targetMarginPct/100):
 *     P·(1 − ecf − targetMarginPct/100) = F
 *     P = F / (1 − ecf − targetMarginPct/100)
 *
 *   The denominator is positive iff ecf + targetMarginPct/100 < 1. When
 *   the sum exceeds 1 the target is infeasible (commission alone consumes
 *   more than the residual margin) and targetPrice = Infinity.
 *
 * Commission model — exactly mirrors computeCommission in commission.ts:
 *
 *   vat-excluded (Trendyol):
 *     commission     = P / (1 + vatRate) × rate
 *     commissionVAT  = commission × commissionVatRate
 *     total / P      = rate × (1 + commissionVatRate) / (1 + vatRate)
 *
 *   vat-included (Hepsiburada, N11 published rates):
 *     commission     = P × rate        (VAT embedded, no separate charge)
 *     total / P      = rate
 *
 *   vat-included-plus-service-vat (Amazon TR):
 *     commission     = P × rate
 *     commissionVAT  = commission × commissionVatRate
 *     total / P      = rate × (1 + commissionVatRate)
 *
 * Return-risk cost — exactly mirrors computeReturnRiskCost in net-profit.ts:
 *   returnRiskCost = returnRate × (unitCost + shippingPerUnit × returnShippingMultiplier)
 *
 * Pure & deterministic: no I/O, no Date, no framework. Same guarantees as the
 * rest of lib/calc — fully unit-testable, safe to call from any context.
 */

import type { CommissionBasis } from "./commission";

// ── Input / output types ─────────────────────────────────────────────────────

export interface SafePriceInput {
  /** Per-unit cost of goods (COGS). */
  unitCost: number;
  /** Per-unit outbound shipping cost. */
  shippingPerUnit: number;
  /** Per-unit packaging cost (box, filler, label). Defaults to 0. */
  packagingPerUnit?: number;
  /** Per-unit advertising / promo spend. Defaults to 0. */
  adSpendPerUnit?: number;
  /** Per-unit payment / settlement processing fee. Defaults to 0. */
  paymentFeePerUnit?: number;
  /** Any flat extra platform / service fees per unit. Defaults to 0. */
  extraFeesPerUnit?: number;
  /**
   * Expected return rate as a fraction 0..1 (e.g. 0.08 = 8 %).
   * Increases fixedCostsPerUnit via the same model as computeReturnRiskCost.
   * Defaults to 0.
   */
  returnRate?: number;
  /**
   * Multiplier applied to `shippingPerUnit` for each returned unit's shipping.
   * Default 2 = outbound + return trip (same default as computeReturnRiskCost).
   */
  returnShippingMultiplier?: number;
  /** Marketplace commission rate, 0..1 (e.g. 0.12 = 12 %). */
  commissionRate: number;
  /**
   * VAT rate levied on the commission service fee itself, 0..1.
   * Used for "vat-excluded" and "vat-included-plus-service-vat".
   * Must be 0 for "vat-included" (published rate already embeds it). Defaults to 0.
   */
  commissionVatRate?: number;
  /** Whether commission is applied to the VAT-exclusive or VAT-inclusive price. */
  commissionBasis: CommissionBasis;
  /**
   * Goods VAT rate, 0..1 (e.g. 0.20 = 20 % KDV).
   * Used to strip VAT from gross price for a "vat-excluded" basis.
   * Pass 0 for "vat-included" or zero-VAT markets (Amazon US).
   */
  vatRate: number;
  /**
   * Desired net-profit margin as a PERCENTAGE of gross price.
   * 0 (default) = floor price (break-even: netProfit ≥ 0).
   * Positive value = target price that achieves that margin.
   */
  targetMarginPct?: number;
}

export interface SafePriceResult {
  /**
   * Minimum gross (VAT-inclusive) price at which netProfit ≥ 0.
   * Rounded up to the nearest cent (ceiling at 2 dp) so the seller always
   * covers costs at this price.
   */
  floorPrice: number;
  /**
   * Minimum gross price to achieve `targetMarginPct` net margin.
   * Equals `floorPrice` when targetMarginPct is 0.
   * Rounded up to the nearest cent.
   * Returns `Infinity` when the target is infeasible.
   */
  targetPrice: number;
  /**
   * All-in commission fraction of gross price (including any service VAT).
   *   "vat-excluded": rate × (1 + commissionVatRate) / (1 + vatRate)
   *   "vat-included": rate
   */
  effectiveCommissionFraction: number;
  /** Sum of all non-commission per-unit costs used in the floor derivation. */
  fixedCostsPerUnit: number;
  /**
   * True when a valid targetPrice exists (denominator > 0).
   * False when effectiveCommissionFraction + targetMarginPct/100 ≥ 1.
   */
  feasible: boolean;
  /** Human-readable Turkish explanation when feasible is false. */
  infeasibleReason?: string;
}

export interface BuyboxSuggestion {
  /** True when the competitor's price is above this seller's floor price. */
  canCompete: boolean;
  /**
   * Recommended listing price:
   *   "floor"      — competitor is too cheap; list at floor anyway.
   *   "target"     — targetPrice ≤ competitorPrice; full margin achievable.
   *   "competitor" — matching competitor; margin between floor and target.
   */
  suggestedPrice: number;
  /** Net-profit margin % at suggestedPrice (0 when canCompete is false). */
  expectedMarginPct: number;
  pricingMode: "floor" | "target" | "competitor";
}

// ── Internal helper ──────────────────────────────────────────────────────────

/** Round UP to 2 decimal places (ceiling-at-cent). */
function ceilPrice(p: number): number {
  return Math.ceil(p * 100) / 100;
}

// ── Core solver ──────────────────────────────────────────────────────────────

export function computeSafePrice(input: SafePriceInput): SafePriceResult {
  const {
    unitCost,
    shippingPerUnit,
    packagingPerUnit = 0,
    adSpendPerUnit = 0,
    paymentFeePerUnit = 0,
    extraFeesPerUnit = 0,
    returnRate = 0,
    returnShippingMultiplier = 2,
    commissionRate,
    commissionVatRate = 0,
    commissionBasis,
    vatRate,
    targetMarginPct = 0,
  } = input;

  // Return-risk: same formula as computeReturnRiskCost(returnRate, cogs, shipping, multiplier).
  const returnRiskCost =
    returnRate * (unitCost + shippingPerUnit * returnShippingMultiplier);

  const fixedCostsPerUnit =
    unitCost +
    shippingPerUnit +
    packagingPerUnit +
    adSpendPerUnit +
    paymentFeePerUnit +
    extraFeesPerUnit +
    returnRiskCost;

  // Effective commission as a fraction of gross price (all-in, including any
  // service VAT on the commission fee).
  const effectiveCommissionFraction =
    commissionBasis === "vat-excluded"
      ? (commissionRate * (1 + commissionVatRate)) / (1 + vatRate)
      : commissionBasis === "vat-included-plus-service-vat"
        ? commissionRate * (1 + commissionVatRate)
        : commissionRate;

  // Floor: P × (1 − ecf) = F  ⟹  P = F / (1 − ecf)
  const floorPrice = ceilPrice(fixedCostsPerUnit / (1 - effectiveCommissionFraction));

  // Target: denominator = 1 − ecf − targetMarginPct/100
  const targetDenominator = 1 - effectiveCommissionFraction - targetMarginPct / 100;
  const feasible = targetDenominator > 0;

  const targetPrice = feasible
    ? ceilPrice(fixedCostsPerUnit / targetDenominator)
    : Infinity;

  const infeasibleReason = feasible
    ? undefined
    : `İstenen kâr marjı (%${targetMarginPct}) ile efektif komisyon oranı ` +
      `(%${(effectiveCommissionFraction * 100).toFixed(1)}) toplamı ≥ %100 — ` +
      `bu marjı karşılayan geçerli bir liste fiyatı mevcut değil.`;

  return {
    floorPrice,
    targetPrice,
    effectiveCommissionFraction,
    fixedCostsPerUnit,
    feasible,
    infeasibleReason,
  };
}

// ── Buybox overlay ───────────────────────────────────────────────────────────

/**
 * Given a pre-computed SafePriceResult and the competitor's current listing
 * price, decides whether and how to compete for the buybox.
 *
 * Decision tree:
 *   competitorPrice < floorPrice  → can't compete profitably; hold at floor.
 *   competitorPrice ≥ floorPrice
 *     feasible AND targetPrice ≤ competitorPrice
 *                                → list at targetPrice (full margin, beats or
 *                                  matches competitor).
 *     otherwise                  → match competitorPrice (profitable, margin
 *                                  between floor and target).
 *
 * The `expectedMarginPct` is derived from the same linear model used in
 * computeSafePrice — it is NOT re-run through the full commission waterfall,
 * so treat it as an approximation (within ≤ 0.01 % of the exact value for
 * prices above the floor).
 */
export function suggestBuyboxPrice(
  safe: SafePriceResult,
  competitorPrice: number,
): BuyboxSuggestion {
  if (competitorPrice < safe.floorPrice) {
    return {
      canCompete: false,
      suggestedPrice: safe.floorPrice,
      expectedMarginPct: 0,
      pricingMode: "floor",
    };
  }

  const useTarget = safe.feasible && safe.targetPrice <= competitorPrice;
  const suggestedPrice = useTarget ? safe.targetPrice : competitorPrice;

  // netProfit at suggestedPrice using the linear model:
  //   netProfit = P × (1 − ecf) − fixedCosts
  const netAtSuggested =
    suggestedPrice * (1 - safe.effectiveCommissionFraction) - safe.fixedCostsPerUnit;
  const expectedMarginPct =
    suggestedPrice > 0
      ? Math.round((netAtSuggested / suggestedPrice) * 10000) / 100
      : 0;

  return {
    canCompete: true,
    suggestedPrice,
    expectedMarginPct,
    pricingMode: useTarget ? "target" : "competitor",
  };
}
