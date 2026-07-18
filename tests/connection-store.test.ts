import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  addConnection,
  getConnections,
  isMarketplaceConnected,
  removeConnection,
  removeConnectionByMarketplace,
  generateDemoTokenRef,
  hydrateConnectionsFromServer,
  markConnectionNeedsReauth,
  touchConnectionSynced,
} from "../lib/connect/store";

describe("connection store (Plaid/Rutter-style demo links)", () => {
  beforeEach(() => {
    const mockStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem(k: string) { return mockStore[k] ?? null; },
      setItem(k: string, v: string) { mockStore[k] = v; },
      removeItem(k: string) { delete mockStore[k]; },
    } as Storage;
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
  });

  it("adds a connection with demo token ref and read-only scopes", () => {
    const c = addConnection("amazon_us", "demo");
    expect(c.marketplaceId).toBe("amazon_us");
    expect(c.provider).toBe("demo");
    expect(c.status).toBe("connected");
    expect(c.accessTokenRef).toMatch(/^tm_demo_/);
    expect(c.scopes).toContain("read:sales");
    expect(isMarketplaceConnected("amazon_us")).toBe(true);
  });

  it("syncs tm_connected_marketplaces for dashboard tabs", () => {
    addConnection("trendyol");
    addConnection("amazon_us");
    const raw = localStorage.getItem("tm_connected_marketplaces");
    expect(JSON.parse(raw!)).toEqual(expect.arrayContaining(["trendyol", "amazon_us"]));
  });

  it("disconnect removes from active list", () => {
    const c = addConnection("ebay");
    expect(getConnections()).toHaveLength(1);
    removeConnection(c.id);
    expect(getConnections()).toHaveLength(0);
    expect(isMarketplaceConnected("ebay")).toBe(false);
  });

  it("disconnect by marketplace id removes the matching connection only", () => {
    addConnection("trendyol", "live");
    addConnection("ebay", "demo");
    expect(getConnections()).toHaveLength(2);
    removeConnectionByMarketplace("trendyol");
    const remaining = getConnections();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].marketplaceId).toBe("ebay");
    expect(isMarketplaceConnected("trendyol")).toBe(false);
  });

  it("generateDemoTokenRef is stable format", () => {
    expect(generateDemoTokenRef("amazon_us")).toMatch(/^tm_demo_amazon_/);
  });

  it("hydrateConnectionsFromServer adds missing live links from another device", () => {
    addConnection("manual_csv", "demo", { method: "csv" });
    const merged = hydrateConnectionsFromServer([
      {
        marketplace: "trendyol",
        sellerId: "123",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-07-18T12:00:00.000Z",
        needsReauth: false,
      },
    ]);
    expect(merged.map((c) => c.marketplaceId).sort()).toEqual(["manual_csv", "trendyol"]);
    const ty = merged.find((c) => c.marketplaceId === "trendyol")!;
    expect(ty.provider).toBe("live");
    expect(ty.lastSyncedAt).toBe("2026-07-18T12:00:00.000Z");
  });

  it("hydrate + markConnectionNeedsReauth keeps the link visible with error status", () => {
    hydrateConnectionsFromServer([{ marketplace: "shopify", needsReauth: true, lastSyncError: "token revoked" }]);
    const cons = getConnections();
    expect(cons).toHaveLength(1);
    expect(cons[0].status).toBe("error");
    expect(isMarketplaceConnected("shopify")).toBe(true);

    markConnectionNeedsReauth("shopify");
    expect(getConnections()[0].status).toBe("error");

    touchConnectionSynced("shopify", "2026-07-18T15:00:00.000Z");
    expect(getConnections()[0]).toMatchObject({
      status: "connected",
      lastSyncedAt: "2026-07-18T15:00:00.000Z",
    });
  });
});
