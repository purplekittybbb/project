import { trialPeriodDays } from "@/lib/billing/stripe-server";

/** Prefix for billing_subscriptions.stripe_customer_id when Stripe is off. */
export const DEMO_CUSTOMER_PREFIX = "demo:";

export function demoCustomerId(userId: string): string {
  return `${DEMO_CUSTOMER_PREFIX}${userId}`;
}

export function isDemoBillingCustomer(stripeCustomerId: string | null | undefined): boolean {
  return !!stripeCustomerId?.startsWith(DEMO_CUSTOMER_PREFIX);
}

export function computeTrialEndIso(from = new Date()): string {
  const end = new Date(from);
  end.setUTCDate(end.getUTCDate() + trialPeriodDays());
  return end.toISOString();
}
