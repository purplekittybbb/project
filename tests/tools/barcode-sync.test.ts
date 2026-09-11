import { describe, expect, it, vi } from "vitest";
import { applyBarcodeMappings } from "../../lib/tools/barcode-sync";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("applyBarcodeMappings", () => {
  it("updates barcode per SKU for the user", async () => {
    const updates: Array<{ sku: string; barcode: string }> = [];
    const client = {
      from: () => ({
        update: (payload: { barcode: string }) => ({
          eq: (_col: string, _val: string) => ({
            eq: (_c2: string, sku: string) => {
              updates.push({ sku, barcode: payload.barcode });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const r = await applyBarcodeMappings(client, "user-1", [
      { sku: "T-SKU", barcode: "8683772071724" },
      { sku: "H-SKU", barcode: "8683772071724" },
    ]);

    expect(r.error).toBeNull();
    expect(r.updatedSkus).toBe(2);
    expect(updates).toEqual([
      { sku: "T-SKU", barcode: "8683772071724" },
      { sku: "H-SKU", barcode: "8683772071724" },
    ]);
  });
});

describe("rowsToBarcodeRows from sync-shaped data", () => {
  it("extracts barcode populated by marketplace sync", async () => {
    const { rowsToBarcodeRows } = await import("../../lib/quality/barcode");
    const rows = rowsToBarcodeRows([
      {
        order_id: "ORD-1",
        sku: "111111",
        category: "Elektronik",
        sale_date: "2026-03-01",
        units: 2,
        gross_revenue: 400,
        unit_cost: 80,
        shipping: 25,
        return_rate: 0.05,
        ad_spend: 0,
        marketplace: "trendyol",
        barcode: "8683772071724",
        product_name: "Bluetooth Kulaklık",
      },
    ]);
    expect(rows[0]?.barcode).toBe("8683772071724");
    expect(rows[0]?.currentPrice).toBe(200);
    expect(rows[0]?.title).toBe("Bluetooth Kulaklık");
  });
});
