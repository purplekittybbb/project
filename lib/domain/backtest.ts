/**
 * Backtest — the single most important artifact for the seed round.
 *
 * Replays each seller's history through BOTH underwriting models and simulates the
 * outcome, so we can say: "had we lent to these sellers on a true-margin model, loss
 * would have been X; on an incumbent revenue-snapshot model, Y; we are Z% better."
 *
 * The result is DRIVEN BY THE LOGIC, not hard-coded: the incumbent over-advances to
 * sellers whose revenue looks healthy but whose true contribution is thin, so its
 * simulated impairment is higher precisely on the "silent loser" sellers the margin
 * engine catches.
 */

import type { Currency, UnderwritingDecision, UnderwritingInputs } from "./canonical";
import { incumbentModel, trueMarginModel } from "./underwriting";

/** A seller as seen by the backtest: identity + the derived underwriting inputs. */
export interface BacktestSeller {
  tenantId: string;
  currency: Currency;
  inputs: UnderwritingInputs;
}

/** Assumed advance term in months (fast-revolving working capital). */
const TERM_MONTHS = 6;

export interface LoanOutcome {
  tenantId: string;
  approvedLimit: number;
  takeRate: number;
  /** Whether a loan was actually originated (limit > 0). */
  isLoan: boolean;
  /** Contribution the seller can realistically generate over the term. */
  contributionOverTerm: number;
  /** Amount owed at end of term (principal + take-rate). */
  owedAtTerm: number;
  impaired: boolean;
  /** Principal loss given impairment; bounded to [0, approvedLimit]. */
  loss: number;
}

export interface ModelResult {
  model: string;
  deployed: number;
  grossYield: number; // take-rate revenue on deployed capital
  totalLoss: number;
  netYield: number; // grossYield - totalLoss
  delinquencyRate: number; // impaired count / total
  chargeOffRate: number; // totalLoss / deployed
  decisions: UnderwritingDecision[];
  outcomes: LoanOutcome[];
}

export interface BacktestReport {
  trueMargin: ModelResult;
  incumbent: ModelResult;
  /** Reduction in charge-off vs incumbent, in percentage points. */
  chargeOffImprovementPp: number;
  /** Relative reduction in loss vs incumbent (0..1). */
  lossReductionPct: number;
}

/**
 * Simulate one loan. A loan impairs when the amount owed at term exceeds what the
 * seller's TRUE contribution can service over that term (with a small buffer). This
 * is why the margin-blind incumbent loses money on thin-margin sellers: it sizes the
 * limit to revenue, but repayment can only come out of true contribution.
 */
export function simulateOutcome(decision: UnderwritingDecision): LoanOutcome {
  const { inputs, approvedLimit, takeRate, tenantId } = decision;
  const monthlyContribution =
    inputs.monthlyRevenue * (inputs.trueMarginPct / 100);
  const contributionOverTerm = monthlyContribution * TERM_MONTHS;

  const periodicTakeRate = takeRate * (TERM_MONTHS / 12);
  const owedAtTerm = approvedLimit * (1 + periodicTakeRate);

  // No capital deployed -> no loan, no loss. (A rejected seller cannot lose money.)
  if (approvedLimit <= 0) {
    return {
      tenantId,
      approvedLimit: 0,
      takeRate,
      isLoan: false,
      contributionOverTerm,
      owedAtTerm: 0,
      impaired: false,
      loss: 0,
    };
  }

  // Repayment can only come out of TRUE contribution. Negative contribution means
  // zero servicing capacity, never a negative that inflates loss beyond principal.
  const serviceable = Math.max(0, contributionOverTerm * 0.6);
  const impaired = owedAtTerm > serviceable;
  // Principal loss is what could not be recovered, bounded to the principal at risk.
  const loss = impaired
    ? Math.min(approvedLimit, Math.max(0, approvedLimit - serviceable))
    : 0;

  return {
    tenantId,
    approvedLimit,
    takeRate,
    isLoan: true,
    contributionOverTerm,
    owedAtTerm,
    impaired,
    loss: Math.round(loss),
  };
}

function runModel(
  model: string,
  decide: (s: BacktestSeller) => UnderwritingDecision,
  sellers: BacktestSeller[]
): ModelResult {
  const decisions: UnderwritingDecision[] = [];
  const outcomes: LoanOutcome[] = [];
  let deployed = 0;
  let grossYield = 0;
  let totalLoss = 0;
  let impairedCount = 0;
  let loansMade = 0;

  for (const s of sellers) {
    const decision = decide(s);
    const outcome = simulateOutcome(decision);
    decisions.push(decision);
    outcomes.push(outcome);

    if (!outcome.isLoan) continue; // rejected seller: no deployment, no risk
    loansMade += 1;
    deployed += decision.approvedLimit;
    grossYield += decision.approvedLimit * decision.takeRate * (TERM_MONTHS / 12);
    totalLoss += outcome.loss;
    if (outcome.impaired) impairedCount += 1;
  }

  return {
    model,
    deployed: Math.round(deployed),
    grossYield: Math.round(grossYield),
    totalLoss: Math.round(totalLoss),
    netYield: Math.round(grossYield - totalLoss),
    delinquencyRate: loansMade === 0 ? 0 : impairedCount / loansMade,
    chargeOffRate: deployed === 0 ? 0 : totalLoss / deployed,
    decisions,
    outcomes,
  };
}

export function runBacktest(sellers: BacktestSeller[]): BacktestReport {
  const trueMargin = runModel(
    "truemargin",
    (s) => trueMarginModel(s.tenantId, s.inputs, s.currency),
    sellers
  );
  const incumbent = runModel(
    "incumbent-revenue-snapshot",
    (s) => incumbentModel(s.tenantId, s.inputs, s.currency),
    sellers
  );

  const chargeOffImprovementPp =
    (incumbent.chargeOffRate - trueMargin.chargeOffRate) * 100;
  const lossReductionPct =
    incumbent.totalLoss === 0
      ? 0
      : (incumbent.totalLoss - trueMargin.totalLoss) / incumbent.totalLoss;

  return {
    trueMargin,
    incumbent,
    chargeOffImprovementPp,
    lossReductionPct,
  };
}
