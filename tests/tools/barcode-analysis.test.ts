import { describe, expect, it } from "vitest";
import { buildBarcodeAnalysis } from "../../lib/tools/barcode-analysis";
import type { UserRawRow } from "../../lib/adapters/csv";
import type { SkuMargin } from "../../lib/domain/margin-engine";

const skuMargins: SkuMargin[] = [
  {
    sku: "T-1",
    category: "Elektronik",
    perceivedMarginPct: 20,
    trueMarginPct: 12,
    gapPct: 8,
    isSilentLoser: false,
    returnRatePct: 2,
    isReturnRisk: false,
  },
  {
    sku: "N-1",
    category: "Elektronik",
    perceivedMarginPct: 18,
    trueMarginPct: 8,
    gapPct: 10,
    isSilentLoser: false,
    returnRatePct: 3,
    isReturnRisk: false,
  },
];

describe("buildBarcodeAnalysis", () => {
  it("groups same barcode across marketplaces with prices", () => {
    const rows: UserRawRow[] = [
      {
        order_id: "1",
        sku: "T-1",
        category: "Elektronik",
        sale_date: "2026-01-01",
        units: 1,
        gross_revenue: 250,
        unit_cost: 100,
        shipping: 30,
        return_rate: 0.02,
        ad_spend: 0,
        marketplace: "trendyol",
        barcode: "8683772071724",
        product_name: "Kulaklık Pro",
      },
      {
        order_id: "2",
        sku: "N-1",
        category: "Elektronik",
        sale_date: "2026-01-02",
        units: 1,
        gross_revenue: 300,
        unit_cost: 100,
        shipping: 30,
        return_rate: 0.03,
        ad_spend: 0,
        marketplace: "n11",
        barcode: "8683772071724",
        product_name: "Kulaklık Pro N11",
      },
    ];

    const r = buildBarcodeAnalysis(rows, skuMargins);
    expect(r.stats.rowsWithBarcode).toBe(2);
    expect(r.stats.multiMarketplaceBarcodes).toBe(1);
    expect(r.products).toHaveLength(1);
    expect(r.products[0]!.marketplaceListings).toHaveLength(2);
    expect(r.products[0]!.priceSpread).toBe(50);
  });

  it("reports empty barcode stats without silent empty products", () => {
    const rows: UserRawRow[] = [
      {
        order_id: "1",
        sku: "X",
        category: "Diğer",
        sale_date: "2026-01-01",
        units: 1,
        gross_revenue: 100,
        unit_cost: 50,
        shipping: 10,
        return_rate: 0,
        ad_spend: 0,
        marketplace: "trendyol",
      },
    ];
    const r = buildBarcodeAnalysis(rows, []);
    expect(r.stats.rowsWithBarcode).toBe(0);
    expect(r.products).toHaveLength(0);
  });
});
