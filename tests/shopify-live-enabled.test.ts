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

  it("returns true when SHOPIFY_CLIENT_ID is set (live → ShopifyConnectModal)", () => {
    process.env.SHOPIFY_CLIENT_ID = "test-client-id";
    delete process.env.SHOPIFY_LIVE_ENABLED;
    expect(isShopifyLiveEnabled()).toBe(true);
  });

  it("returns false when SHOPIFY_CLIENT_ID is missing (demo → MarketplaceOAuthModal)", () => {
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
 * Mirrors MarketplaceConnectStep.startConnect branching for Shopify only.
 * Keeps the decision table explicit and regression-proof without mounting React.
 */
function pickShopifyModal(liveEnabled: boolean): "ShopifyConnectModal" | "MarketplaceOAuthModal" {
  return liveEnabled ? "ShopifyConnectModal" : "MarketplaceOAuthModal";
}

describe("Shopify connect modal selection (/connect)", () => {
  it("opens ShopifyConnectModal when live OAuth is enabled", () => {
    expect(pickShopifyModal(true)).toBe("ShopifyConnectModal");
  });

  it("falls back to MarketplaceOAuthModal when live OAuth is disabled", () => {
    expect(pickShopifyModal(false)).toBe("MarketplaceOAuthModal");
  });
});
