/**
 * Marketplace connection types — Plaid/Rutter-style aggregator model.
 *
 * A Connection is the durable link between a seller account and a marketplace
 * data source. In production this would be backed by Rutter/Codat OAuth tokens;
 * in demo mode we persist connection metadata + a synthetic token ref locally.
 *
 * The margin engine is untouched — connections only govern WHICH marketplaces
 * appear connected in the UI and which adapter channels are active.
 */

/**
 * Aggregator that established the link (swap demo → rutter/codat later).
 * "live" marks a connection whose credentials were actually validated
 * against the real marketplace API (currently: Trendyol) — see
 * app/api/trendyol/connect/route.ts.
 */
export type ConnectionProvider = "demo" | "rutter" | "codat" | "live";

export type ConnectionStatus = "connected" | "disconnected" | "error";

/** Read-only scopes we request — never write/payment. */
export const READ_ONLY_SCOPES = [
  "read:sales",
  "read:settlements",
] as const;

export type ReadOnlyScope = (typeof READ_ONLY_SCOPES)[number];

/**
 * How the seller actually establishes the link — mirrors what each real
 * platform supports today, not a one-size-fits-all OAuth fiction:
 * - oauth: consent-screen redirect (Shopify, plus demo-only platforms)
 * - api_key: seller pastes a self-service key/secret from their own seller panel
 * - coming_soon: real integration requires platform approval (e.g. Amazon SP-API)
 * - manual: no connection at all — seller enters rows by hand later
 * - csv: file upload, parsed client-side
 */
export type ConnectionMethod = "oauth" | "api_key" | "coming_soon" | "manual" | "csv";

/** One credential input for an api_key connection form. */
export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  /** Render as a password input and mask before storing any reference to it. */
  secret?: boolean;
}

/**
 * Token-like connection record. `accessTokenRef` is a demo artifact only —
 * NOT a real secret and never sent to a server in demo mode. For api_key
 * connections it is a masked reference (e.g. tm_key_n11_****ab12), never the
 * raw credential the seller typed in.
 */
export interface MarketplaceConnection {
  id: string;
  marketplaceId: string;
  provider: ConnectionProvider;
  status: ConnectionStatus;
  connectedAt: string;
  /** Demo: tm_demo_xxxx · prod: opaque ref to vault-stored token */
  accessTokenRef: string;
  scopes: ReadOnlyScope[];
  lastSyncedAt?: string;
  /** How this connection was established (oauth/api_key/manual/csv). */
  method?: ConnectionMethod;
}

/** OAuth modal phases — mirrors real redirect/consent/token exchange UX. */
export type OAuthPhase =
  | "redirecting"
  | "consent"
  | "connecting"
  | "fetching"
  | "connected"
  | "cancelled";

export interface ConnectionProviderAdapter {
  readonly provider: ConnectionProvider;
  /** Begin link flow for one marketplace (demo opens modal; prod returns auth URL). */
  startLink(marketplaceId: string): void;
  /** Complete link after user authorizes (demo simulates latency). */
  completeLink(marketplaceId: string): Promise<MarketplaceConnection>;
  disconnect(connectionId: string): void;
}
