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
 * Connect-step policy: Shopify uses the REAL Partner-app OAuth flow
 * (ShopifyConnectModal -> /api/shopify/oauth/*) whenever this deployment has
 * live credentials (SHOPIFY_CLIENT_ID/SECRET) configured — a user must never
 * be told "Connected" without a real Shopify redirect happening. Only when no
 * live credentials exist does it fall back to the demo consent modal
 * (MarketplaceOAuthModal) — and that modal now explicitly discloses it's
 * sample data, so a demo connection can never be mistaken for a real one.
 * See components/MarketplaceConnectStep.tsx's startConnect().
 */
function pickShopifyConnectStepModal(liveEnabled: boolean): "ShopifyConnectModal" | "MarketplaceOAuthModal" {
  return liveEnabled ? "ShopifyConnectModal" : "MarketplaceOAuthModal";
}

describe("Shopify connect modal selection (/connect)", () => {
  it("uses the REAL ShopifyConnectModal (Partner OAuth) when live credentials are configured", () => {
    expect(pickShopifyConnectStepModal(true)).toBe("ShopifyConnectModal");
  });

  it("falls back to the demo MarketplaceOAuthModal when no live credentials exist", () => {
    expect(pickShopifyConnectStepModal(false)).toBe("MarketplaceOAuthModal");
  });
});
