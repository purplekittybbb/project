/**
 * Tests for lib/quality/barcode.ts
 *
 * Pure function tests — no I/O, no mocking required.
 */

import { describe, it, expect } from "vitest";
import {
  groupByBarcode,
  detectPriceInconsistencies,
  toCanonicalProduct,
  buildAllCanonicalProducts,
  rowsToBarcodeRows,
  type BarcodeRow,
  type BarcodeMatch,
} from "@/lib/quality/barcode";
import type { UserRawRow } from "@/lib/adapters/csv";

// ── groupByBarcode ────────────────────────────────────────────────────────────

describe("groupByBarcode", () => {
  it("returns empty map for empty input", () => {
    const result = groupByBarcode([]);
    expect(result.size).toBe(0);
  });

  it("skips rows with null barcode", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "SKU-1", title: "Ürün A", barcode: null },
      { marketplace: "n11",      sku: "SKU-2", title: "Ürün B", barcode: null },
    ];
    const result = groupByBarcode(rows);
    expect(result.size).toBe(0);
  });

  it("skips rows with empty string barcode", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "SKU-1", title: "Ürün A", barcode: "" },
      { marketplace: "n11",      sku: "SKU-2", title: "Ürün B", barcode: "   " },
    ];
    const result = groupByBarcode(rows);
    expect(result.size).toBe(0);
  });

  it("groups rows with the same barcode correctly", () => {
    const rows: BarcodeRow[] = [
      {
        marketplace: "trendyol",
        sku: "T-SKU-1",
        title: "Bluetooth Kulaklık Model X",
        barcode: "1234567890123",
        currentPrice: 250,
        trueMarginPct: 15,
      },
      {
        marketplace: "n11",
        sku: "N-SKU-1",
        title: "Bluetooth Kulaklık X",
        barcode: "1234567890123",
        currentPrice: 280,
        trueMarginPct: 10,
      },
    ];

    const result = groupByBarcode(rows);
    expect(result.size).toBe(1);

    const match = result.get("1234567890123")!;
    expect(match).toBeDefined();
    expect(match.barcode).toBe("1234567890123");
    expect(match.listings).toHaveLength(2);
  });

  it("canonicalTitle is the longest non-null title", () => {
    const rows: BarcodeRow[] = [
      {
        marketplace: "trendyol",
        sku: "T-1",
        title: "Bluetooth Kulaklık Model X Detaylı Başlık",
        barcode: "111",
        currentPrice: 200,
      },
      {
        marketplace: "n11",
        sku: "N-1",
        title: "Kulaklık X",
        barcode: "111",
        currentPrice: 220,
      },
    ];

    const result = groupByBarcode(rows);
    const match = result.get("111")!;
    expect(match.canonicalTitle).toBe("Bluetooth Kulaklık Model X Detaylı Başlık");
  });

  it("priceSpread is max - min price", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol",    sku: "T-1", title: "Ürün", barcode: "222", currentPrice: 100 },
      { marketplace: "hepsiburada", sku: "H-1", title: "Ürün", barcode: "222", currentPrice: 150 },
      { marketplace: "n11",         sku: "N-1", title: "Ürün", barcode: "222", currentPrice: 80  },
    ];

    const result = groupByBarcode(rows);
    const match = result.get("222")!;
    expect(match.priceSpread).toBe(70); // 150 - 80
  });

  it("priceSpread is 0 when only one listing has a price", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "333", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün", barcode: "333", currentPrice: undefined },
    ];

    const result = groupByBarcode(rows);
    const match = result.get("333")!;
    expect(match.priceSpread).toBe(0);
  });

  it("bestMarketplace is the one with highest trueMarginPct", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "444", trueMarginPct: 20, currentPrice: 200 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün", barcode: "444", trueMarginPct: 5,  currentPrice: 220 },
    ];

    const result = groupByBarcode(rows);
    const match = result.get("444")!;
    expect(match.bestMarketplace).toBe("trendyol");
  });

  it("keeps different barcodes as separate matches", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün A", barcode: "AAA", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün B", barcode: "BBB", currentPrice: 200 },
    ];

    const result = groupByBarcode(rows);
    expect(result.size).toBe(2);
    expect(result.has("AAA")).toBe(true);
    expect(result.has("BBB")).toBe(true);
  });

  it("mixes null and valid barcodes correctly", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün A", barcode: "VALID-1" },
      { marketplace: "n11",      sku: "N-1", title: "Ürün B", barcode: null },
      { marketplace: "n11",      sku: "N-2", title: "Ürün A2", barcode: "VALID-1" },
    ];

    const result = groupByBarcode(rows);
    expect(result.size).toBe(1);
    expect(result.get("VALID-1")?.listings).toHaveLength(2);
  });
});

// ── detectPriceInconsistencies ────────────────────────────────────────────────

describe("detectPriceInconsistencies", () => {
  function makeMatch(
    barcode: string,
    listings: Array<{ marketplace: string; price: number }>
  ): BarcodeMatch {
    const rows: BarcodeRow[] = listings.map((l) => ({
      marketplace: l.marketplace,
      sku: `${l.marketplace}-sku`,
      title: "Test Ürün",
      barcode,
      currentPrice: l.price,
    }));
    const map = groupByBarcode(rows);
    return map.get(barcode)!;
  }

  it("returns empty array when no matches have spread above threshold", () => {
    const match = makeMatch("BC-1", [
      { marketplace: "trendyol", price: 100 },
      { marketplace: "n11",      price: 110 }, // spread 10 < 20
    ]);
    const result = detectPriceInconsistencies([match]);
    expect(result).toEqual([]);
  });

  it("returns inconsistency when spread > threshold (default 20 TL)", () => {
    const match = makeMatch("BC-2", [
      { marketplace: "trendyol", price: 100 },
      { marketplace: "n11",      price: 150 }, // spread 50
    ]);
    const result = detectPriceInconsistencies([match]);
    expect(result).toHaveLength(1);
    expect(result[0].barcode).toBe("BC-2");
    expect(result[0].spread).toBe(50);
    expect(result[0].cheapestMarketplace).toBe("trendyol");
    expect(result[0].expensiveMarketplace).toBe("n11");
  });

  it("suggestion is in Turkish format", () => {
    const match = makeMatch("BC-3", [
      { marketplace: "trendyol", price: 200 },
      { marketplace: "n11",      price: 250 },
    ]);
    const result = detectPriceInconsistencies([match]);
    expect(result[0].suggestion).toContain("trendyol");
    expect(result[0].suggestion).toContain("₺");
    expect(result[0].suggestion).toContain("daha ucuz satılıyor");
  });

  it("respects custom minSpreadThreshold", () => {
    const match = makeMatch("BC-4", [
      { marketplace: "trendyol", price: 100 },
      { marketplace: "n11",      price: 125 }, // spread 25
    ]);

    // threshold=30 → not included
    expect(detectPriceInconsistencies([match], 30)).toEqual([]);
    // threshold=20 → included (spread 25 > 20)
    expect(detectPriceInconsistencies([match], 20)).toHaveLength(1);
    // threshold=10 → included
    expect(detectPriceInconsistencies([match], 10)).toHaveLength(1);
  });

  it("handles matches with only one priced listing gracefully", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "BC-5", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün", barcode: "BC-5", currentPrice: undefined },
    ];
    const map = groupByBarcode(rows);
    const match = map.get("BC-5")!;
    const result = detectPriceInconsistencies([match]);
    expect(result).toEqual([]);
  });

  it("handles empty matches array", () => {
    expect(detectPriceInconsistencies([])).toEqual([]);
  });

  it("handles multiple matches with mixed spread", () => {
    const m1 = makeMatch("BC-6", [
      { marketplace: "trendyol", price: 100 },
      { marketplace: "n11",      price: 105 }, // spread 5 < 20
    ]);
    const m2 = makeMatch("BC-7", [
      { marketplace: "trendyol", price: 100 },
      { marketplace: "n11",      price: 160 }, // spread 60 > 20
    ]);

    const result = detectPriceInconsistencies([m1, m2]);
    expect(result).toHaveLength(1);
    expect(result[0].barcode).toBe("BC-7");
  });
});

// ── toCanonicalProduct ────────────────────────────────────────────────────────

describe("toCanonicalProduct", () => {
  it("maps BarcodeMatch fields to CanonicalProduct", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Bluetooth Kulaklık Model X", barcode: "EAN-1", currentPrice: 200, trueMarginPct: 18 },
      { marketplace: "n11",      sku: "N-1", title: "Kulaklık X",                  barcode: "EAN-1", currentPrice: 250, trueMarginPct: 10 },
    ];
    const match = groupByBarcode(rows).get("EAN-1")!;
    const product = toCanonicalProduct(match);

    expect(product.barcode).toBe("EAN-1");
    expect(product.canonicalTitle).toBe("Bluetooth Kulaklık Model X");
    expect(product.marketplaceListings).toHaveLength(2);
    expect(product.priceSpread).toBe(50);
    expect(product.bestMarketplace).toBe("trendyol");
    expect(product.priceInconsistency).toBeUndefined();
  });

  it("includes priceInconsistency when provided", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "EAN-2", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün", barcode: "EAN-2", currentPrice: 180 },
    ];
    const match = groupByBarcode(rows).get("EAN-2")!;
    const [inc] = detectPriceInconsistencies([match]);
    const product = toCanonicalProduct(match, inc);

    expect(product.priceInconsistency).toBeDefined();
    expect(product.priceInconsistency!.spread).toBe(80);
    expect(product.priceInconsistency!.cheapestMarketplace).toBe("trendyol");
    expect(product.priceInconsistency!.expensiveMarketplace).toBe("n11");
    expect(product.priceInconsistency!.suggestion).toContain("daha ucuz satılıyor");
  });

  it("omits priceInconsistency when not provided", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "EAN-3", currentPrice: 100 },
    ];
    const match = groupByBarcode(rows).get("EAN-3")!;
    const product = toCanonicalProduct(match);
    expect(product.priceInconsistency).toBeUndefined();
  });
});

// ── buildAllCanonicalProducts ─────────────────────────────────────────────────

describe("buildAllCanonicalProducts", () => {
  it("returns empty array for empty input", () => {
    expect(buildAllCanonicalProducts([])).toEqual([]);
  });

  it("skips rows without barcode", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: null },
    ];
    expect(buildAllCanonicalProducts(rows)).toEqual([]);
  });

  it("builds one CanonicalProduct per unique barcode", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün A", barcode: "AAA", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün B", barcode: "BBB", currentPrice: 200 },
      { marketplace: "n11",      sku: "N-2", title: "Ürün A2", barcode: "AAA", currentPrice: 140 },
    ];
    const products = buildAllCanonicalProducts(rows);
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.barcode).sort()).toEqual(["AAA", "BBB"]);
  });

  it("attaches inconsistency only when spread exceeds threshold", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "HIGH", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün", barcode: "HIGH", currentPrice: 160 },
      { marketplace: "trendyol", sku: "T-2", title: "Ürün", barcode: "LOW",  currentPrice: 100 },
      { marketplace: "n11",      sku: "N-2", title: "Ürün", barcode: "LOW",  currentPrice: 110 },
    ];
    const products = buildAllCanonicalProducts(rows); // default threshold 20
    const high = products.find((p) => p.barcode === "HIGH")!;
    const low  = products.find((p) => p.barcode === "LOW")!;
    expect(high.priceInconsistency).toBeDefined();
    expect(high.priceInconsistency!.spread).toBe(60);
    expect(low.priceInconsistency).toBeUndefined();
  });

  it("respects custom minSpreadThreshold", () => {
    const rows: BarcodeRow[] = [
      { marketplace: "trendyol", sku: "T-1", title: "Ürün", barcode: "BC", currentPrice: 100 },
      { marketplace: "n11",      sku: "N-1", title: "Ürün", barcode: "BC", currentPrice: 125 },
    ];
    // threshold=30 → no inconsistency
    expect(buildAllCanonicalProducts(rows, 30)[0].priceInconsistency).toBeUndefined();
    // threshold=20 → inconsistency attached
    expect(buildAllCanonicalProducts(rows, 20)[0].priceInconsistency).toBeDefined();
  });
});

// ── rowsToBarcodeRows ─────────────────────────────────────────────────────────

describe("rowsToBarcodeRows", () => {
  function raw(overrides: Partial<UserRawRow> = {}): UserRawRow {
    return {
      order_id: "ORD-1",
      sku: "SKU-A",
      category: "Elektronik",
      sale_date: "2026-06-01",
      units: 2,
      gross_revenue: 400,
      unit_cost: 0,
      shipping: 0,
      return_rate: 0,
      ad_spend: 0,
      marketplace: "trendyol",
      ...overrides,
    };
  }

  it("derives currentPrice as unit revenue", () => {
    const [row] = rowsToBarcodeRows([raw({ units: 2, gross_revenue: 400 })]);
    expect(row.currentPrice).toBe(200);
  });

  it("uses product_name as title, falls back to sku", () => {
    const [named] = rowsToBarcodeRows([raw({ product_name: "Kulaklık X" })]);
    expect(named.title).toBe("Kulaklık X");
    const [unnamed] = rowsToBarcodeRows([raw()]);
    expect(unnamed.title).toBe("SKU-A");
  });

  it("passes barcode through, empty string becomes null", () => {
    expect(rowsToBarcodeRows([raw({ barcode: "8683772071724" })] )[0].barcode).toBe("8683772071724");
    expect(rowsToBarcodeRows([raw({ barcode: "  " })] )[0].barcode).toBeNull();
    expect(rowsToBarcodeRows([raw()] )[0].barcode).toBeNull();
  });

  it("feeds groupByBarcode correctly for the same barcode across marketplaces", () => {
    const rows = rowsToBarcodeRows([
      raw({ marketplace: "trendyol", barcode: "111", units: 1, gross_revenue: 100 }),
      raw({ marketplace: "n11", sku: "N-1", barcode: "111", units: 1, gross_revenue: 160 }),
    ]);
    const products = buildAllCanonicalProducts(rows);
    expect(products).toHaveLength(1);
    expect(products[0].priceSpread).toBe(60);
    expect(products[0].priceInconsistency).toBeDefined();
  });
});
