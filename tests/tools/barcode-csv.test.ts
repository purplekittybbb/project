import { describe, expect, it } from "vitest";
import { parseBarcodeMappingCsv } from "../../lib/tools/barcode-csv";

describe("parseBarcodeMappingCsv", () => {
  it("parses sku,barkod header CSV", () => {
    const csv = `sku,barkod
T-1,8683772071724
H-2,8683772071725`;
    const r = parseBarcodeMappingCsv(csv);
    expect(r.ok).toBe(true);
    expect(r.mappings).toHaveLength(2);
    expect(r.mappings[0]).toEqual({ sku: "T-1", barcode: "8683772071724" });
  });

  it("accepts semicolon delimiter", () => {
    const csv = "stok_kodu;ean\nSKU-A;1234567890123";
    const r = parseBarcodeMappingCsv(csv);
    expect(r.ok).toBe(true);
    expect(r.mappings[0]?.sku).toBe("SKU-A");
  });

  it("fails when required columns missing", () => {
    const r = parseBarcodeMappingCsv("name,price\nx,1");
    expect(r.ok).toBe(false);
  });
});
