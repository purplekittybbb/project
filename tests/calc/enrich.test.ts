import { describe, expect, it } from "vitest";
import {
  enrichRowWithProductCost,
  enrichRowsWithProductCosts,
  type ProductCost,
} from "../../lib/calc/enrich";
import type { UserRawRow } from "../../lib/adapters/csv";

function row(overrides: Partial<UserRawRow> = {}): UserRawRow {
  return {
    order_id: "O-1",
    sku: "SKU-1",
    category: "Elektronik",
    sale_date: "2026-05-10",
    units: 4,
    gross_revenue: 4000,
    unit_cost: 0,
    shipping: 0,
    return_rate: 0,
    ad_spend: 0,
    packaging: 0,
    marketplace: "trendyol",
    ...overrides,
  };
}

describe("enrichRowWithProductCost", () => {
  it("fills every zero cost field from a per-unit profile (× units)", () => {
    const cost: ProductCost = {
      unitCost: 180,
      shippingPerUnit: 10,
      returnRate: 0.06,
      adSpendPerUnit: 5,
      packagingPerUnit: 2,
    };
    const r = enrichRowWithProductCost(row({ units: 4 }), cost);
    expect(r.unit_cost).toBe(180); // per unit, applied as-is
    expect(r.shipping).toBe(40); // 10 × 4
    expect(r.return_rate).toBe(0.06); // rate, as-is
    expect(r.ad_spend).toBe(20); // 5 × 4
    expect(r.packaging).toBe(8); // 2 × 4
  });

  it("never overwrites values already present (CSV/manual wins)", () => {
    const cost: ProductCost = { unitCost: 180, shippingPerUnit: 10, returnRate: 0.06 };
    const r = enrichRowWithProductCost(
      row({ unit_cost: 200, shipping: 999, return_rate: 0.2 }),
      cost,
    );
    expect(r.unit_cost).toBe(200);
    expect(r.shipping).toBe(999);
    expect(r.return_rate).toBe(0.2);
  });

  it("returns a copy unchanged when there is no profile", () => {
    const original = row();
    const r = enrichRowWithProductCost(original, undefined);
    expect(r).toEqual(original);
    expect(r).not.toBe(original); // new object, no mutation
  });

  it("treats a missing packaging field as a gap and guards units ≤ 0", () => {
    const { packaging, ...noPackaging } = row({ units: 0 });
    void packaging;
    const r = enrichRowWithProductCost(noPackaging as UserRawRow, {
      packagingPerUnit: 3,
      shippingPerUnit: 7,
    });
    // units 0 → treated as 1 so a per-unit cost still lands.
    expect(r.packaging).toBe(3);
    expect(r.shipping).toBe(7);
  });

  it("leaves a field untouched when the profile omits it", () => {
    const r = enrichRowWithProductCost(row(), { unitCost: 50 });
    expect(r.unit_cost).toBe(50);
    expect(r.shipping).toBe(0); // no shippingPerUnit provided
    expect(r.ad_spend).toBe(0);
  });
});

describe("enrichRowsWithProductCosts", () => {
  it("looks each row's profile up by SKU and passes unknown SKUs through", () => {
    const costs = new Map<string, ProductCost>([["SKU-1", { unitCost: 100 }]]);
    const rows = [row({ sku: "SKU-1" }), row({ sku: "SKU-2" })];
    const [a, b] = enrichRowsWithProductCosts(rows, costs);
    expect(a.unit_cost).toBe(100);
    expect(b.unit_cost).toBe(0); // no profile for SKU-2
  });

  it("does not apply a Hepsiburada cost profile to the same SKU on Trendyol", () => {
    const costs = new Map<string, ProductCost>([
      ["hepsiburada::SKU-1", { unitCost: 50 }],
      ["trendyol::SKU-1", { unitCost: 180 }],
    ]);
    const [ty, hb] = enrichRowsWithProductCosts(
      [row({ sku: "SKU-1", marketplace: "trendyol" }), row({ sku: "SKU-1", marketplace: "hepsiburada" })],
      costs,
    );
    expect(ty.unit_cost).toBe(180);
    expect(hb.unit_cost).toBe(50);
  });
});
