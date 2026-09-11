/**
 * Official Amazon SP-API constants for Turkey.
 *
 * Sources (not guessed):
 *   Marketplace ID: https://developer-docs.amazon.com/sp-api/docs/marketplace-ids
 *     Turkey = A33AVAJ2PDY3EV, country code TR
 *   Endpoint: https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints
 *     Europe region (includes Turkey) → https://sellingpartnerapi-eu.amazon.com
 *   Seller Central (TR): https://sellercentral.amazon.com.tr
 *   LWA token host: https://api.amazon.com/auth/o2/token
 *     (https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api)
 */

export const AMAZON_TR_MARKETPLACE_ID = "A33AVAJ2PDY3EV";
export const AMAZON_TR_COUNTRY_CODE = "TR";
export const SP_API_EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";
export const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
export const AMAZON_TR_SELLER_CENTRAL = "https://sellercentral.amazon.com.tr";

export function amazonTrConsentUrl(opts: {
  applicationId: string;
  state: string;
  /** Draft apps must pass version=beta. Production published apps omit it. */
  draft?: boolean;
}): string {
  const u = new URL("/apps/authorize/consent", AMAZON_TR_SELLER_CENTRAL);
  u.searchParams.set("application_id", opts.applicationId);
  u.searchParams.set("state", opts.state);
  if (opts.draft) u.searchParams.set("version", "beta");
  return u.toString();
}
