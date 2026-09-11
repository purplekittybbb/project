/**
 * Gate: Amazon SP-API live order calls.
 *
 * TWO independent flags:
 *   1. LWA app credentials present (AMAZON_LWA_CLIENT_ID + APPLICATION_ID)
 *      → OAuth consent URL can be built. Mirrored to the client as
 *      AMAZON_LWA_LIVE_ENABLED (never the secret).
 *   2. AMAZON_SP_API_LIVE_ENABLED=1
 *      → actually calling GET /orders/v0/orders is allowed.
 *
 * Flag (2) stays OFF until the first joint live test against a real Amazon
 * seller account. OAuth token exchange is tested with mocks; it does not
 * hit Amazon unless the operator starts the browser consent flow.
 */

export function isAmazonLwaConfigured(): boolean {
  if (process.env.AMAZON_LWA_CLIENT_ID?.trim() && process.env.AMAZON_APPLICATION_ID?.trim()) {
    return true;
  }
  return process.env.AMAZON_LWA_LIVE_ENABLED === "1";
}

/**
 * Live Orders API calls. Default false. Never inferred from LWA credentials
 * alone — connecting the app ≠ permission to scrape a seller's orders until
 * the first watched test.
 */
export function isAmazonSpApiLiveEnabled(): boolean {
  return process.env.AMAZON_SP_API_LIVE_ENABLED === "1";
}

export class AmazonLiveGuardError extends Error {
  constructor(
    message = "Amazon SP-API canlı sipariş çekimi kapalı. İlk deneme birlikte, izleyerek yapılacak (AMAZON_SP_API_LIVE_ENABLED).",
  ) {
    super(message);
    this.name = "AmazonLiveGuardError";
  }
}

export function assertAmazonOrdersLiveAllowed(): void {
  if (!isAmazonSpApiLiveEnabled()) throw new AmazonLiveGuardError();
}
