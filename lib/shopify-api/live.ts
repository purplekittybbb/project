/**
 * Single gate: real Shopify Partner-app OAuth vs demo MarketplaceOAuthModal.
 *
 * Server code can read SHOPIFY_CLIENT_ID directly. Client components cannot
 * (no NEXT_PUBLIC_ prefix — the secret stays server-only). next.config.mjs
 * mirrors presence as SHOPIFY_LIVE_ENABLED so this same function works in both.
 */
export function isShopifyLiveEnabled(): boolean {
  if (process.env.SHOPIFY_CLIENT_ID?.trim()) return true;
  return process.env.SHOPIFY_LIVE_ENABLED === "1";
}
