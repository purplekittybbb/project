/**
 * Client-side connection store (localStorage).
 *
 * SSR-safe. In production, swap this sink for Supabase/API while keeping the
 * same MarketplaceConnection shape and read-only scope contract.
 */

import type { ConnectionMethod, MarketplaceConnection } from "./types";
import { READ_ONLY_SCOPES } from "./types";

const STORAGE_KEY = "tm_marketplace_connections";

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

/** All active (connected) marketplace links. */
export function getConnections(): MarketplaceConnection[] {
  return readAll().filter((c) => c.status === "connected");
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
