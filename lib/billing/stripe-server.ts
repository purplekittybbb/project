import Stripe from "stripe";
import { TRIAL_DAYS } from "@/lib/onboarding";
import { stripeLaunchCurrency, stripeLaunchUnitAmount } from "@/lib/product-market";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function growthPlanPriceId(): string | null {
  const id = process.env.STRIPE_PRICE_ID?.trim();
  return id || null;
}

/** Subscription line item — configured Price ID or inline price_data for dev. */
export function growthSubscriptionItem(): Stripe.SubscriptionCreateParams.Item {
  const priceId = growthPlanPriceId();
  if (priceId) return { price: priceId };
  return {
    price_data: {
      currency: stripeLaunchCurrency(),
      product_data: { name: "TrueMargin Growth" },
      unit_amount: stripeLaunchUnitAmount(),
      recurring: { interval: "month" },
    } as any,
  };
}

export function trialPeriodDays(): number {
  const fromEnv = Number(process.env.STRIPE_TRIAL_DAYS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return TRIAL_DAYS;
}
