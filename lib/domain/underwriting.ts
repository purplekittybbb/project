/**
 * Underwriting module — rule-based and EXPLAINABLE (not a black box).
 *
 * The EU AI Act treats credit scoring as high-risk and requires explainability;
 * every decision here returns a structured `rationale`. Two models are implemented:
 *
 *  - trueMarginModel:   sizes credit to the seller's REAL contribution profit and
 *                       prices risk off true margin, velocity and volatility.
 *  - incumbentModel:    the Wayflyer/Clearco-style naive model that underwrites off
 *                       a gross-revenue snapshot only — it cannot see true margin,
 *                       so it over-lends to thin-margin sellers.
 */

import type { Currency, UnderwritingDecision, UnderwritingInputs } from "./canonical";

export const MODEL_VERSION = "truemargin-underwriting/0.1.0";

const MIN_TAKE_RATE = 0.03; // 3% floor
const MAX_TAKE_RATE = 0.06; // 6% ceiling (target band 3-6%)

/** Multiple of trailing monthly contribution we are willing to advance. */
const CONTRIBUTION_MULTIPLE = 3;
/** Incumbent advances a flat share of trailing monthly REVENUE (margin-blind). */
const INCUMBENT_REVENUE_SHARE = 0.35;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function round(x: number): number {
  return Math.round(x);
}

/**
 * TrueMargin model: limit is anchored to real contribution profit, discounted by
 * volatility; price rises as true margin, velocity and tenure fall.
 */
export function trueMarginModel(
  tenantId: string,
  inputs: UnderwritingInputs,
  currency: Currency,
  now: Date = new Date()
): UnderwritingDecision {
  const rationale: string[] = [];

  const volatilityHaircut = clamp(1 - inputs.revenueVolatility, 0.4, 1);
  const baseLimit = inputs.trailingMonthlyContribution * CONTRIBUTION_MULTIPLE;
  const approvedLimit = round(Math.max(0, baseLimit * volatilityHaircut));

  rationale.push(
    `Limit anchored to ${CONTRIBUTION_MULTIPLE}x trailing monthly contribution ` +
      `(${round(inputs.trailingMonthlyContribution)} ${currency}).`
  );
  rationale.push(
    `Volatility haircut ${(volatilityHaircut * 100).toFixed(0)}% applied ` +
      `(revenue CoV ${inputs.revenueVolatility.toFixed(2)}).`
  );

  // Risk premium: higher for thin margin, slow stock, short tenure, high returns.
  let premium = 0;
  if (inputs.trueMarginPct < 10) {
    premium += 0.015;
    rationale.push("True margin below 10% -> +1.5% risk premium.");
  } else if (inputs.trueMarginPct < 20) {
    premium += 0.007;
    rationale.push("True margin 10-20% -> +0.7% risk premium.");
  } else {
    rationale.push("True margin above 20% -> no margin premium.");
  }
  if (inputs.returnRate > 0.1) {
    premium += 0.005;
    rationale.push(`Return rate ${(inputs.returnRate * 100).toFixed(0)}% -> +0.5% premium.`);
  }
  if (inputs.tenureMonths < 12) {
    premium += 0.005;
    rationale.push(`Tenure ${inputs.tenureMonths}m (<12m) -> +0.5% premium.`);
  }

  const takeRate = clamp(MIN_TAKE_RATE + premium, MIN_TAKE_RATE, MAX_TAKE_RATE);
  rationale.push(`Take rate set to ${(takeRate * 100).toFixed(1)}% (band 3-6%).`);

  return {
    tenantId,
    timestamp: now.toISOString(),
    modelVersion: MODEL_VERSION,
    inputs,
    approvedLimit,
    takeRate,
    rationale,
    currency,
  };
}

/**
 * Incumbent model: margin-blind. Advances a share of trailing monthly revenue and
 * prices flat. Because it cannot see true margin, it over-advances to sellers whose
 * revenue looks healthy but whose real contribution is thin — the root cause of loss.
 */
export function incumbentModel(
  tenantId: string,
  inputs: UnderwritingInputs,
  currency: Currency,
  now: Date = new Date()
): UnderwritingDecision {
  const approvedLimit = round(inputs.monthlyRevenue * INCUMBENT_REVENUE_SHARE);
  const takeRate = 0.05; // flat 5%, margin-blind
  return {
    tenantId,
    timestamp: now.toISOString(),
    modelVersion: "incumbent-revenue-snapshot/1.0.0",
    inputs,
    approvedLimit,
    takeRate,
    rationale: [
      `Limit = 0.35x trailing monthly revenue (${round(inputs.monthlyRevenue)} ${currency}).`,
      "Priced flat at 5%; true margin not observed.",
    ],
    currency,
  };
}
