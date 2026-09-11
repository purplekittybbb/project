/**
 * Persistence helpers for canonical_products (migration 0026).
 * Soft-fail when the client returns an error — never throw.
 */
import { describe, expect, it, vi } from "vitest";
import {
  upsertCanonicalProducts,
  loadCanonicalProducts,
  loadPriceInconsistencies,
} from "@/lib/supabase/canonical-products";
import type { CanonicalProduct } from "@/lib/domain/canonical";
import type { SupabaseClient } from "@supabase/supabase-js";

function product(overrides: Partial<CanonicalProduct> = {}): CanonicalProduct {
  return {
    barcode: "8683772071724",
    canonicalTitle: "Bluetooth Kulaklık X",
    marketplaceListings: [
      { marketplace: "trendyol", sku: "T-1", title: "Bluetooth Kulaklık X", currentPrice: 200 },
      { marketplace: "n11", sku: "N-1", title: "Kulaklık X", currentPrice: 260 },
    ],
    priceSpread: 60,
    bestMarketplace: "trendyol",
    priceInconsistency: {
      spread: 60,
      cheapestMarketplace: "trendyol",
      expensiveMarketplace: "n11",
      suggestion: "trendyol pazaryerinde ₺60.00 daha ucuz satılıyor",
    },
    ...overrides,
  };
}

function chain(resolved: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {};
  const ret = () => self;
  self.from = ret;
  self.select = ret;
  self.eq = ret;
  self.order = ret;
  self.upsert = vi.fn().mockResolvedValue(resolved);
  self.then = (ok: (v: unknown) => unknown) => Promise.resolve(resolved).then(ok);
  return self as unknown as SupabaseClient;
}

describe("upsertCanonicalProducts", () => {
  it("returns null error for empty input without touching the client", async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    const { error } = await upsertCanonicalProducts(client, "user-1", []);
    expect(error).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("upserts on user_id,barcode and reports client errors", async () => {
    const client = chain({ data: null, error: { message: "relation missing" } });
    const { error } = await upsertCanonicalProducts(client, "user-1", [product()]);
    expect(error).toBe("relation missing");
  });

  it("returns null error on successful upsert", async () => {
    const client = chain({ data: [{}], error: null });
    const { error } = await upsertCanonicalProducts(client, "user-1", [product()]);
    expect(error).toBeNull();
  });
});

describe("loadCanonicalProducts / loadPriceInconsistencies", () => {
  it("returns empty array on read error (never throws)", async () => {
    const client = chain({ data: null, error: { message: "boom" } });
    expect(await loadCanonicalProducts(client, "user-1")).toEqual([]);
    expect(await loadPriceInconsistencies(client, "user-1")).toEqual([]);
  });

  it("maps a stored row into StoredCanonicalProduct", async () => {
    const row = {
      id: "id-1",
      user_id: "user-1",
      barcode: "8683772071724",
      canonical_title: "Kulaklık X",
      marketplace_count: 2,
      price_spread: "60",
      best_marketplace: "trendyol",
      has_price_inconsistency: true,
      inconsistency_spread: "60",
      cheapest_marketplace: "trendyol",
      expensive_marketplace: "n11",
      inconsistency_suggestion: "trendyol pazaryerinde ₺60.00 daha ucuz satılıyor",
      computed_at: "2026-09-11T00:00:00.000Z",
    };
    const client = chain({ data: [row], error: null });
    const [stored] = await loadCanonicalProducts(client, "user-1");
    expect(stored.barcode).toBe("8683772071724");
    expect(stored.priceSpread).toBe(60);
    expect(stored.hasPriceInconsistency).toBe(true);
    expect(stored.cheapestMarketplace).toBe("trendyol");
  });
});
