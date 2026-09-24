/**
 * calc — the pure, deterministic Aşama A financial core.
 *
 * Single source of truth for commission (VAT-basis aware) and net-profit math.
 * Framework-independent (no Next.js, no I/O), so it is fully unit-testable and
 * reused identically by adapters, API routes, and background jobs.
 */

export {
  computeCommission,
  type CommissionBasis,
  type CommissionRule,
  type CommissionResult,
} from "./commission";

export {
  computeNetProfit,
  computeReturnRiskCost,
  type NetProfitInput,
  type NetProfitBreakdown,
  type NetProfitResult,
} from "./net-profit";

export {
  detectLossAlarms,
  DEFAULT_LOSS_ALARM_THRESHOLDS,
  type LossAlarm,
  type LossAlarmLevel,
  type LossAlarmThresholds,
} from "./loss-alarm";

export {
  enrichRowWithProductCost,
  enrichRowsWithProductCosts,
  lookupProductCost,
  productCostKey,
  type ProductCost,
} from "./enrich";

export {
  computeSafePrice,
  suggestBuyboxPrice,
  type SafePriceInput,
  type SafePriceResult,
  type BuyboxSuggestion,
} from "./safe-price";
