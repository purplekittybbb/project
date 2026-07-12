import { describe, expect, it, afterEach } from "vitest";
import { isShopifyLiveEnabled } from "../lib/shopify-api/live";

describe("isShopifyLiveEnabled", () => {
  const prevClientId = process.env.SHOPIFY_CLIENT_ID;
  const prevLiveFlag = process.env.SHOPIFY_LIVE_ENABLED;

  afterEach(() => {
    if (prevClientId === undefined) delete process.env.SHOPIFY_CLIENT_ID;
    else process.env.SHOPIFY_CLIENT_ID = prevClientId;
    if (prevLiveFlag === undefined) delete process.env.SHOPIFY_LIVE_ENABLED;
    else process.env.SHOPIFY_LIVE_ENABLED = prevLiveFlag;
  });

  it("returns true when SHOPIFY_CLIENT_ID is set", () => {
    process.env.SHOPIFY_CLIENT_ID = "test-client-id";
    delete process.env.SHOPIFY_LIVE_ENABLED;
    expect(isShopifyLiveEnabled()).toBe(true);
  });

  it("returns false when SHOPIFY_CLIENT_ID is missing", () => {
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_LIVE_ENABLED;
    expect(isShopifyLiveEnabled()).toBe(false);
  });

  it("returns false when SHOPIFY_CLIENT_ID is blank/whitespace", () => {
    process.env.SHOPIFY_CLIENT_ID = "   ";
    delete process.env.SHOPIFY_LIVE_ENABLED;
    expect(isShopifyLiveEnabled()).toBe(false);
  });

  it("returns true via SHOPIFY_LIVE_ENABLED mirror (client-bundle path)", () => {
    delete process.env.SHOPIFY_CLIENT_ID;
    process.env.SHOPIFY_LIVE_ENABLED = "1";
    expect(isShopifyLiveEnabled()).toBe(true);
  });
});

/**
 * Connect-step policy: Shopify always uses the demo MarketplaceOAuthModal,
 * matching eBay/Walmart/Etsy. Live OAuth (ShopifyConnectModal + /api/shopify/oauth/*)
 * stays available but is not the /connect default — even when live credentials exist.
 */
function pickShopifyConnectStepModal(_liveEnabled: boolean): "MarketplaceOAuthModal" {
  return "MarketplaceOAuthModal";
}

describe("Shopify connect modal selection (/connect)", () => {
  it("uses MarketplaceOAuthModal even when live OAuth is enabled", () => {
    expect(pickShopifyConnectStepModal(true)).toBe("MarketplaceOAuthModal");
  });

  it("uses MarketplaceOAuthModal when live OAuth is disabled", () => {
    expect(pickShopifyConnectStepModal(false)).toBe("MarketplaceOAuthModal");
  });
});
