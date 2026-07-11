/**
 * Single gate: real Stripe card capture vs demo card form on /connect.
 *
 * Server code can read STRIPE_SECRET_KEY directly. Client components use the
 * NEXT_PUBLIC publishable key + STRIPE_LIVE_ENABLED mirror from next.config.mjs.
 */
export function isStripeLiveEnabled(): boolean {
  if (process.env.STRIPE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()) {
    return true;
  }
  return process.env.STRIPE_LIVE_ENABLED === "1";
}
