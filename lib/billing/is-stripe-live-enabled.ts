/**
 * Stripe is "live" only when BOTH secret and publishable keys are present.
 * Aligns with next.config.mjs STRIPE_LIVE_ENABLED so /connect and
 * StripePaymentForm never disagree (secret-only → dead-end UI).
 */
export function isStripeLiveEnabled(): boolean {
  if (process.env.STRIPE_LIVE_ENABLED === "1") return true;
  if (process.env.STRIPE_LIVE_ENABLED === "0") return false;
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return Boolean(secret && publishable);
}
