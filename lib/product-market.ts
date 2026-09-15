import type { Channel } from "@/lib/engine";

/**
 * Product market positioning — single source of truth.
 *
 * COMPANY (PRIMARY_MARKET): TrueMargin is a US-focused company — landing page,
 * investor narrative, long-term pricing in USD.
 *
 * LAUNCH (LAUNCH_COHORT_REGION): First paying customers are Turkish marketplace
 * sellers. Onboarding defaults, connect order, dashboard tabs, and trial pricing
 * follow the launch cohort until LAUNCH_COHORT_REGION is switched to "us".
 */
export const PRIMARY_MARKET = "us" as const;
export const LAUNCH_COHORT_REGION = "tr" as const;

export function isLaunchCohortTurkish(): boolean {
  return LAUNCH_COHORT_REGION === "tr";
}

/** Default dashboard / copilot channel when nothing else is selected. */
export const DEFAULT_CHANNEL: Channel = isLaunchCohortTurkish() ? "trendyol" : "amazon_us";

/** Fallback channel tabs when localStorage has no marketplace selection. */
export const DEFAULT_DASHBOARD_CHANNELS: Channel[] = isLaunchCohortTurkish()
  ? ["trendyol", "hepsiburada", "n11", "amazon_tr", "shopify", "amazon_us"]
  : ["amazon_us", "shopify", "trendyol"];

/**
 * Channel tabs for the public /demo walkthrough. This is intentionally NOT
 * DEFAULT_DASHBOARD_CHANNELS: that list names every marketplace we *plan* to
 * support, shown as if already connected, even though lib/data/seed.ts only
 * ever seeds Trendyol + Amazon (US) + Hepsiburada transactions for the demo
 * sellers. Showing all 6 as pre-connected tabs in a demo where nobody
 * connected anything reads as fake/broken (channels with zero real data
 * behind them). The demo should only ever show marketplaces the seller
 * actually has data for — same principle as "tabs appear as you add
 * sellers", applied to a walkthrough that never lets you add any.
 */
export const DEMO_DASHBOARD_CHANNELS: Channel[] = ["trendyol", "amazon_us", "hepsiburada"];

/** Connect step marketplace section order — launch cohort first. */
export const CONNECT_REGION_ORDER = isLaunchCohortTurkish()
  ? (["tr", "own_store", "us", "other", "individual"] as const)
  : (["us", "own_store", "tr", "other", "individual"] as const);

/** Growth plan after free trial — company list price (USD). */
export const GROWTH_PLAN_PRICE_USD = 79;

/** Launch cohort list price (TRY) for first Turkish customers. */
export const GROWTH_PLAN_PRICE_TRY = 2400;

export interface LaunchPlanDisplay {
  amount: number;
  currency: "TRY" | "USD";
  symbol: string;
  formattedAfterTrial: string;
}

/** Plan step + Stripe inline price for the active launch cohort. */
export function launchPlanDisplay(): LaunchPlanDisplay {
  if (isLaunchCohortTurkish()) {
    return {
      amount: GROWTH_PLAN_PRICE_TRY,
      currency: "TRY",
      symbol: "₺",
      formattedAfterTrial: `₺${GROWTH_PLAN_PRICE_TRY.toLocaleString("tr-TR")}/mo`,
    };
  }
  return {
    amount: GROWTH_PLAN_PRICE_USD,
    currency: "USD",
    symbol: "$",
    formattedAfterTrial: `$${GROWTH_PLAN_PRICE_USD}/mo`,
  };
}

/** Stripe subscription currency for the launch cohort. */
export function stripeLaunchCurrency(): "try" | "usd" {
  return isLaunchCohortTurkish() ? "try" : "usd";
}

export function stripeLaunchUnitAmount(): number {
  const plan = launchPlanDisplay();
  return plan.amount * 100;
}
