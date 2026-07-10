import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchHepsiburadaOrders, mapHepsiburadaOrdersToUserRawRows,
  HepsiburadaAuthError, HepsiburadaApiError, HepsiburadaMappingError,
  HepsiburadaOrderSchema,
} from "../lib/hepsiburada-api/client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("Hepsiburada API client — real order fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws HepsiburadaAuthError on a real 401 from Hepsiburada (wrong credentials)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401)));

    await expect(
      fetchHepsiburadaOrders({ merchantId: "bad", apiKey: "wrong", apiSecret: "wrong" })
    ).rejects.toBeInstanceOf(HepsiburadaAuthError);
  });

  it("throws HepsiburadaAuthError on a real 403 from Hepsiburada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Forbidden" }, 403)));

    await expect(
      fetchHepsiburadaOrders({ merchantId: "bad", apiKey: "wrong", apiSecret: "wrong" })
    ).rejects.toBeInstanceOf(HepsiburadaAuthError);
  });

  it("retries on 429 honoring X-RateLimit-Reset, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "x-ratelimit-reset": "0" }))
      .mockResolvedValueOnce(jsonResponse([], 200));
    vi.stubGlobal("fetch", fetchMock);

    const orders = await fetchHepsiburadaOrders({ merchantId: "1", apiKey: "k", apiSecret: "s" });
    expect(orders).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws HepsiburadaApiError on other non-2xx responses (e.g. 500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500)));

    await expect(
      fetchHepsiburadaOrders({ merchantId: "1", apiKey: "k", apiSecret: "s" })
    ).rejects.toBeInstanceOf(HepsiburadaApiError);
  });

  it("sends Basic Auth built from apiKey:apiSecret and the merchant User-Agent, with limit/offset pagination params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([], 200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchHepsiburadaOrders({ merchantId: "b2910839-83b9-4d45-adb6-86bad457edcb", apiKey: "myKey", apiSecret: "mySecret" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("oms-external.hepsiburada.com/orders/merchantid/b2910839-83b9-4d45-adb6-86bad457edcb");
    expect(String(url)).toContain("offset=0");
    expect(String(url)).toContain("limit=10");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("myKey:mySecret").toString("base64")}`);
    expect(headers["User-Agent"]).toBe("b2910839-83b9-4d45-adb6-86bad457edcb - SelfIntegration");
  });

  it("stops paginating once a page returns fewer than the page limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(Array(10).fill({ orderNumber: "O1", lineItems: [] }), 200))
      .mockResolvedValueOnce(jsonResponse(Array(3).fill({ orderNumber: "O2", lineItems: [] }), 200));
    vi.stubGlobal("fetch", fetchMock);

    const orders = await fetchHepsiburadaOrders({ merchantId: "1", apiKey: "k", apiSecret: "s" });
    expect(orders).toHaveLength(13);
    expect(fetchMock).toHaveBeenCalledTimes(2); // did not fetch a 3rd (empty) page
  });

  it("accepts a bare array, {items:[...]}, and {content:[...]} response wrapper shapes", async () => {
    const one = { orderNumber: "A", lineItems: [] };
    for (const wrapped of [[one], { items: [one] }, { content: [one] }]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wrapped, 200)));
      const orders = await fetchHepsiburadaOrders({ merchantId: "1", apiKey: "k", apiSecret: "s" });
      expect(orders[0]?.orderNumber).toBe("A");
      vi.unstubAllGlobals();
    }
  });
});

describe("HepsiburadaOrderSchema — type safety at the boundary", () => {
  it("accepts both PascalCase and camelCase field names (observed inconsistency across Hepsiburada docs)", () => {
    const camel = HepsiburadaOrderSchema.safeParse({
      orderNumber: "123", orderDate: "2026-06-15T10:00:00",
      lineItems: [{ sku: "A", quantity: 1, unitPrice: { amount: 10, currency: "TRY" } }],
    });
    const pascal = HepsiburadaOrderSchema.safeParse({
      OrderNumber: "123", OrderDate: "2026-06-15T10:00:00",
      LineItems: [{ Sku: "A", Quantity: 1, UnitPrice: { Amount: 10, Currency: "TRY" } }],
    });
    expect(camel.success).toBe(true);
    expect(pascal.success).toBe(true);
  });

  it("rejects a quantity that isn't a number (type safety, not just presence)", () => {
    const result = HepsiburadaOrderSchema.safeParse({
      orderNumber: "123",
      lineItems: [{ sku: "A", quantity: "not-a-number" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("mapHepsiburadaOrdersToUserRawRows — real order data mapping", () => {
  it("maps real revenue/units/date via totalPrice.amount, defaults cost fields Hepsiburada can't provide to 0", () => {
    const rows = mapHepsiburadaOrdersToUserRawRows([
      {
        orderNumber: "HB-ORD-1",
        orderDate: "2026-06-15T10:00:00",
        lineItems: [
          { sku: "SKU-A", quantity: 2, totalPrice: { amount: 500, currency: "TRY" } },
          { sku: "SKU-B", quantity: 1, unitPrice: { amount: 100, currency: "TRY" } },
        ],
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      order_id: "HB-ORD-1",
      sku: "SKU-A",
      units: 2,
      gross_revenue: 500,
      unit_cost: 0,
      shipping: 0,
      return_rate: 0,
      ad_spend: 0,
      marketplace: "hepsiburada",
      sale_date: "2026-06-15",
    });
    expect(rows[1].sku).toBe("SKU-B");
    expect(rows[1].gross_revenue).toBe(100); // unitPrice.amount * units(1)
  });

  it("falls back to PascalCase fields (Sku/Quantity/TotalPrice.Amount) when that's what came back", () => {
    const rows = mapHepsiburadaOrdersToUserRawRows([
      {
        OrderNumber: "HB-ORD-2",
        LineItems: [{ Sku: "PASCAL-SKU", Quantity: 3, TotalPrice: { Amount: 90, Currency: "TRY" } }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ order_id: "HB-ORD-2", sku: "PASCAL-SKU", units: 3, gross_revenue: 90 });
  });

  it("skips lines with no sku or zero/negative revenue", () => {
    const rows = mapHepsiburadaOrdersToUserRawRows([
      {
        orderNumber: "HB-ORD-3",
        lineItems: [
          { sku: "", quantity: 1, totalPrice: { amount: 100 } },
          { sku: "OK-SKU", quantity: 1, totalPrice: { amount: 0 } },
          { sku: "REAL-SKU", quantity: 1, totalPrice: { amount: 50 } },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("REAL-SKU");
  });

  // The dangerous scenario this protection exists for — see the equivalent
  // Trendyol test (tests/trendyol-api.test.ts) for the full rationale.
  it("THROWS HepsiburadaMappingError instead of silently returning [] when order lines exist but none map (schema mismatch)", () => {
    const ordersWithUnknownSchema = [
      {
        orderNumber: "ORD-FUTURE-SCHEMA",
        lineItems: [{ itemCode: "SOME-SKU", qty: 3, totalCost: 999 }],
      },
    ] as unknown as Parameters<typeof mapHepsiburadaOrdersToUserRawRows>[0];

    expect(() => mapHepsiburadaOrdersToUserRawRows(ordersWithUnknownSchema)).toThrow(HepsiburadaMappingError);
  });

  it("does NOT throw for a genuinely empty result (no orders — legitimate, not a bug)", () => {
    expect(mapHepsiburadaOrdersToUserRawRows([])).toEqual([]);
    expect(mapHepsiburadaOrdersToUserRawRows([{ orderNumber: "ORD-EMPTY", lineItems: [] }])).toEqual([]);
  });
});
