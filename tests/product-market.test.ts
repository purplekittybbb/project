import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHANNEL,
  DEFAULT_DASHBOARD_CHANNELS,
  LAUNCH_COHORT_REGION,
  PRIMARY_MARKET,
  isLaunchCohortTurkish,
  launchPlanDisplay,
  stripeLaunchCurrency,
} from "../lib/product-market";
import { REGION_ORDER } from "../lib/marketplaces";

describe("product-market — US company, TR launch cohort", () => {
  it("positions the company as US-focused", () => {
    expect(PRIMARY_MARKET).toBe("us");
  });

  it("defaults UX to Turkish launch cohort", () => {
    expect(LAUNCH_COHORT_REGION).toBe("tr");
    expect(isLaunchCohortTurkish()).toBe(true);
    expect(DEFAULT_CHANNEL).toBe("trendyol");
    expect(DEFAULT_DASHBOARD_CHANNELS[0]).toBe("trendyol");
    expect(REGION_ORDER[0]).toBe("tr");
  });

  it("shows TRY pricing for the Turkish launch cohort", () => {
    const plan = launchPlanDisplay();
    expect(plan.currency).toBe("TRY");
    expect(plan.symbol).toBe("₺");
    expect(stripeLaunchCurrency()).toBe("try");
  });
});
