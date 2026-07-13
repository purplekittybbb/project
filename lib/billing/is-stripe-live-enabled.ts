export function isStripeLiveEnabled(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return !!key;
}
