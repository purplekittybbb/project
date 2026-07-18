/**
 * Client-side connection store (localStorage) + server hydrate.
 *
 * Live marketplace credentials live in Supabase (`marketplace_credentials`).
 * localStorage mirrors that for instant UI + demo/CSV/manual links that have
 * no server row. Always call `hydrateConnectionsFromServer` on /connect and
 * dashboard mount so a sign-in on another device still shows real links.
 */

import type { ConnectionMethod, MarketplaceConnection } from "./types";
import { READ_ONLY_SCOPES } from "./types";

const STORAGE_KEY = "tm_marketplace_connections";

/** Subset of /api/marketplace/credentials-status `connections` used to hydrate. */
export interface ServerCredentialConnection {
  marketplace: string;
  sellerId?: string;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  needsReauth?: boolean;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readAll(): MarketplaceConnection[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as MarketplaceConnection[]) : [];
  } catch {
    return [];
  }
}

function writeAll(connections: MarketplaceConnection[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

/** All active marketplace links (connected + error/needs-reauth — still linked). */
export function getConnections(): MarketplaceConnection[] {
  return readAll().filter((c) => c.status === "connected" || c.status === "error");
}

export function getConnectionByMarketplace(marketplaceId: string): MarketplaceConnection | undefined {
  return getConnections().find((c) => c.marketplaceId === marketplaceId);
}

export function isMarketplaceConnected(marketplaceId: string): boolean {
  return !!getConnectionByMarketplace(marketplaceId);
}

/** Demo token ref — cosmetic only, never a real credential. */
export function generateDemoTokenRef(marketplaceId: string): string {
  const slug = marketplaceId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  return `tm_demo_${slug}_${rand}`;
}

export function addConnection(
  marketplaceId: string,
  provider: MarketplaceConnection["provider"] = "demo",
  opts?: { tokenRef?: string; method?: ConnectionMethod }
): MarketplaceConnection {
  const existing = readAll();
  const filtered = existing.filter((c) => c.marketplaceId !== marketplaceId);
  const conn: MarketplaceConnection = {
    id: `conn_${Date.now()}_${marketplaceId}`,
    marketplaceId,
    provider,
    status: "connected",
    connectedAt: new Date().toISOString(),
    accessTokenRef: opts?.tokenRef ?? generateDemoTokenRef(marketplaceId),
    scopes: [...READ_ONLY_SCOPES],
    lastSyncedAt: new Date().toISOString(),
    method: opts?.method,
  };
  writeAll([...filtered, conn]);
  syncConnectedMarketplaceIds();
  return conn;
}

/** Mask a raw credential for display — never persist or log the real value. */
export function maskCredential(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 4 ? `****${trimmed.slice(-4)}` : "****";
}

export function removeConnection(connectionId: string): void {
  const next = readAll().map((c) =>
    c.id === connectionId ? { ...c, status: "disconnected" as const } : c
  );
  writeAll(next.filter((c) => c.status === "connected"));
  syncConnectedMarketplaceIds();
}

export function removeConnectionByMarketplace(marketplaceId: string): void {
  const conn = getConnectionByMarketplace(marketplaceId);
  if (conn) removeConnection(conn.id);
}

export function clearAllConnections(): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  syncConnectedMarketplaceIds();
}

/** Keep legacy `tm_connected_marketplaces` in sync for dashboard tabs. */
function syncConnectedMarketplaceIds(): void {
  if (!hasWindow()) return;
  const ids = getConnections().map((c) => c.marketplaceId);
  window.localStorage.setItem("tm_connected_marketplaces", JSON.stringify(ids));
}

/**
 * Merge server-verified live credentials into localStorage.
 *
 * - Adds missing live connections (other device / cleared localStorage).
 * - Upgrades demo → live if the server has a real credential row.
 * - Refreshes lastSyncedAt / status (error when needsReauth).
 * - Never removes demo/csv/manual local-only links that have no server row.
 */
export function hydrateConnectionsFromServer(
  serverConnections: ServerCredentialConnection[]
): MarketplaceConnection[] {
  if (!hasWindow()) return [];
  const existing = readAll();
  const byMarketplace = new Map(existing.map((c) => [c.marketplaceId, c]));

  for (const sc of serverConnections) {
    const prev = byMarketplace.get(sc.marketplace);
    const status: MarketplaceConnection["status"] = sc.needsReauth ? "error" : "connected";
    const next: MarketplaceConnection = {
      id: prev?.id ?? `conn_server_${sc.marketplace}`,
      marketplaceId: sc.marketplace,
      provider: "live",
      status,
      connectedAt: sc.connectedAt ?? prev?.connectedAt ?? new Date().toISOString(),
      accessTokenRef: prev?.accessTokenRef ?? `tm_key_${sc.marketplace}_live`,
      scopes: [...READ_ONLY_SCOPES],
      lastSyncedAt: sc.lastSyncedAt ?? prev?.lastSyncedAt,
      method: prev?.method ?? (sc.marketplace === "shopify" ? "oauth" : "api_key"),
    };
    byMarketplace.set(sc.marketplace, next);
  }

  const merged = Array.from(byMarketplace.values()).filter(
    (c) => c.status === "connected" || c.status === "error"
  );
  writeAll(merged);
  syncConnectedMarketplaceIds();
  return getConnections();
}

/** Update lastSyncedAt for one marketplace after a successful client-side resync. */
export function touchConnectionSynced(marketplaceId: string, at = new Date().toISOString()): void {
  if (!hasWindow()) return;
  const next = readAll().map((c) =>
    c.marketplaceId === marketplaceId
      ? { ...c, lastSyncedAt: at, status: "connected" as const }
      : c
  );
  writeAll(next);
  syncConnectedMarketplaceIds();
}

/** Mark a connection as needing re-auth after a 401 from the vendor. */
export function markConnectionNeedsReauth(marketplaceId: string): void {
  if (!hasWindow()) return;
  const next = readAll().map((c) =>
    c.marketplaceId === marketplaceId ? { ...c, status: "error" as const } : c
  );
  writeAll(next);
  syncConnectedMarketplaceIds();
}
