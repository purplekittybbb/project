import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  addConnection,
  getConnections,
  isMarketplaceConnected,
  removeConnection,
  removeConnectionByMarketplace,
  generateDemoTokenRef,
} from "../lib/connect/store";

describe("connection store (Plaid/Rutter-style demo links)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(k: string) { return this.store[k] ?? null; },
      setItem(k: string, v: string) { this.store[k] = v; },
      removeItem(k: string) { delete this.store[k]; },
    });
    vi.stubGlobal("window", { localStorage: localStorage as Storage });
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
});
