import { describe, expect, it } from "vitest";
import { parseCsv } from "../lib/adapters/csv";

describe("parseCsv — tolerant marketplace CSV import", () => {
  it("parses the standard comma-delimited schema", () => {
    const csv =
      "order_id,sku,category,sale_date,units,gross_revenue,unit_cost,shipping,return_rate,ad_spend\n" +
      "O-1,SKU-1,Elektronik,2026-05-10,200,80000,180,4000,0.08,12000\n" +
      "O-2,SKU-2,Elektronik,2026-05-24,150,60000,200,3000,0.06,8000\n";
    const res = parseCsv(csv);
    expect(res.ok).toBe(true);
    expect(res.rowCount).toBe(2);
    expect(res.delimiter).toBe(",");
    expect(res.rows[0].gross_revenue).toBe(80000);
    expect(res.rows[0].sku).toBe("SKU-1");
  });

  it("handles Turkish headers, semicolon delimiter and decimal comma", () => {
    const csv =
      "Stok Kodu;Kategori;Satış Tarihi;Adet;Satış Tutarı;Birim Maliyet;Kargo;İade Oranı;Reklam\n" +
      "EL-1;Elektronik;10.05.2026;200;80.000,50;180,00;4.000;0,08;12.000\n";
    const res = parseCsv(csv);
    expect(res.ok).toBe(true);
    expect(res.delimiter).toBe(";");
    const r = res.rows[0];
    expect(r.sku).toBe("EL-1");
    expect(r.gross_revenue).toBeCloseTo(80000.5, 1); // 80.000,50
    expect(r.unit_cost).toBe(180);                    // 180,00
    expect(r.shipping).toBe(4000);                    // 4.000 (tr thousands)
    expect(r.return_rate).toBeCloseTo(0.08, 5);       // 0,08
    expect(r.ad_spend).toBe(12000);                   // 12.000
    expect(r.sale_date).toBe("2026-05-10");           // 10.05.2026 → ISO
  });

  it("detects the header row past a metadata preamble (Amazon-style) and marketplace", () => {
    const csv =
      "Settlement report for Store XYZ\n" +
      "Date range: 2026-05-01 to 2026-05-31\n" +
      "amazon-order-id,sku,quantity,product sales,selling fees\n" +
      "111-2222,ABC-1,3,150.00,-20.00\n" +
      "111-3333,ABC-2,1,50.00,-8.00\n";
    const res = parseCsv(csv);
    expect(res.ok).toBe(true);
    expect(res.rowCount).toBe(2);
    expect(res.marketplace).toBe("amazon_us");
    expect(res.rows[0].sku).toBe("ABC-1");
    expect(res.rows[0].units).toBe(3);
    expect(res.rows[0].gross_revenue).toBe(150);
  });

  it("skips zero-revenue / footer rows", () => {
    const csv =
      "sku,sale_date,units,gross_revenue,unit_cost\n" +
      "S-1,2026-05-10,10,5000,100\n" +
      "TOTAL,,,,\n" +
      "S-2,2026-05-11,5,0,100\n";
    const res = parseCsv(csv);
    expect(res.ok).toBe(true);
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].sku).toBe("S-1");
  });

  it("errors clearly when a revenue column is missing", () => {
    const csv = "sku,sale_date,units\nS-1,2026-05-10,10\n";
    const res = parseCsv(csv);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/gelir|tutar/i);
  });

  it("defaults missing optional columns and reports warnings", () => {
    const csv = "sku,gross_revenue\nS-1,5000\n";
    const res = parseCsv(csv);
    expect(res.ok).toBe(true);
    expect(res.rows[0].units).toBe(1);
    expect(res.rows[0].unit_cost).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
