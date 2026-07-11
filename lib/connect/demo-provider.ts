/**
 * Demo OAuth provider — simulates Plaid/Rutter link flow without real OAuth.
 *
 * Future: add `rutter-provider.ts` implementing the same ConnectionProviderAdapter
 * interface; swap at runtime based on env. The UI (MarketplaceOAuthModal) stays
 * the same for demo; prod may redirect to external consent URL instead.
 */

import { addConnection, removeConnection } from "./store";
import type { MarketplaceConnection } from "./types";
import { getMarketplaceOption } from "../marketplaces";
import { isAuthConfigured } from "../supabase/client";
import { loadUserRows, saveUserRows } from "../supabase/user-data";
import type { UserRawRow } from "../adapters/csv";

const LINK_LATENCY_MS = 1200;
const FETCH_LATENCY_MS = 900;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** After user taps Authorize — simulate token exchange + initial sync. */
export async function completeDemoLink(marketplaceId: string): Promise<MarketplaceConnection> {
  await delay(LINK_LATENCY_MS);
  return addConnection(marketplaceId, "demo");
}

const SAMPLE_CATEGORY_BY_MARKETPLACE: Record<string, string> = {
  trendyol: "Ev & Yaşam",
  hepsiburada: "Elektronik",
  amazon_us: "Home",
  shopify: "Apparel",
  n11: "Ev & Yaşam",
};

/** A few representative settlement rows for one connected marketplace (demo initial sync). */
function sampleRowsFor(marketplaceId: string): UserRawRow[] {
  const category = SAMPLE_CATEGORY_BY_MARKETPLACE[marketplaceId] ?? "Diğer";
  const today = Date.now();
  const isoDaysAgo = (days: number) => new Date(today - days * 86_400_000).toISOString().slice(0, 10);
  const skuPrefix = marketplaceId.toUpperCase();

  return [
    { order_id: `${marketplaceId}-init-1`, sku: `${skuPrefix}-SKU-01`, category, sale_date: isoDaysAgo(26), units: 40, gross_revenue: 18000, unit_cost: 120, shipping: 900, return_rate: 0.06, ad_spend: 1400, marketplace: marketplaceId },
    { order_id: `${marketplaceId}-init-2`, sku: `${skuPrefix}-SKU-02`, category, sale_date: isoDaysAgo(13), units: 30, gross_revenue: 13500, unit_cost: 140, shipping: 700, return_rate: 0.05, ad_spend: 1100, marketplace: marketplaceId },
    { order_id: `${marketplaceId}-init-3`, sku: `${skuPrefix}-SKU-01`, category, sale_date: isoDaysAgo(3), units: 44, gross_revenue: 19800, unit_cost: 120, shipping: 990, return_rate: 0.06, ad_spend: 1500, marketplace: marketplaceId },
  ];
}

/**
 * Simulate the aggregator's initial data pull after a seller authorizes a
 * marketplace. Only marketplaces with a real engine adapter (see engineChannel in
 * lib/marketplaces.ts) get sample settlement rows persisted — anything else stays
 * a demo-mode ghost tab with no invented numbers. Idempotent: connecting the same
 * marketplace twice never duplicates rows.
 *
 * Marketplaces whose connect UI hits a live API (MarketplaceApiKeyModal →
 * the platform's own /api/.../connect route) persist real rows themselves —
 * never invent demo settlement data here. Shopify is NOT in this set: when
 * live (isShopifyLiveEnabled), /api/shopify/oauth/callback writes real rows;
 * when demo, simulateInitialSync may seed sample rows like other oauth demos.
 */
const LIVE_INTEGRATION_MARKETPLACES = new Set(["trendyol", "hepsiburada", "n11"]);

export async function simulateInitialSync(conn: MarketplaceConnection): Promise<void> {
  if (LIVE_INTEGRATION_MARKETPLACES.has(conn.marketplaceId)) return;

  await delay(FETCH_LATENCY_MS);

  const opt = getMarketplaceOption(conn.marketplaceId);
  if (!opt?.engineChannel || !isAuthConfigured()) return;

  const existing = await loadUserRows();
  if (existing.some((r) => r.marketplace === conn.marketplaceId)) return;

  await saveUserRows(sampleRowsFor(conn.marketplaceId));
}

export function disconnectDemo(connectionId: string): void {
  removeConnection(connectionId);
}
