/**
 * Demo OAuth provider — simulates Plaid/Rutter link flow without real OAuth.
 *
 * Future: add `rutter-provider.ts` implementing the same ConnectionProviderAdapter
 * interface; swap at runtime based on env. The UI (MarketplaceOAuthModal) stays
 * the same for demo; prod may redirect to external consent URL instead.
 */

import { addConnection, removeConnection } from "./store";
import type { MarketplaceConnection } from "./types";

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

/**
 * Simulate the aggregator's initial data pull after a seller authorizes a
 * marketplace. This is a NO-OP for real (authenticated) accounts — it used to
 * write fabricated sample rows (sampleRowsFor, above) straight into the
 * signed-in user's real Supabase user_transactions table for any marketplace
 * without a live adapter (Amazon US, and Shopify when Shopify isn't
 * live-configured), with nothing in the UI marking those rows as invented.
 * A real seller's dashboard could then show fake revenue/margin numbers
 * mixed in with their real ones, indistinguishable from real data — never
 * acceptable for a product a seller uses to make pricing/financing
 * decisions. The dashboard already has an honest fallback for a connected-
 * but-dataless marketplace (app/dashboard/page.tsx's "Henüz veri yok" empty
 * state via hasNoRealDataYet), so the correct behavior here is simply: don't
 * write anything. Marketplaces whose connect UI hits a live API
 * (MarketplaceApiKeyModal → the platform's own /api/.../connect route, or
 * Shopify's real OAuth callback) persist real rows themselves, unaffected by
 * this function. sampleRowsFor() above is kept only for local/demo-mode
 * preview surfaces that never touch a real user's account.
 */
export async function simulateInitialSync(_conn: MarketplaceConnection): Promise<{ error: string | null }> {
  await delay(FETCH_LATENCY_MS);
  return { error: null };
}

export function disconnectDemo(connectionId: string): void {
  removeConnection(connectionId);
}
