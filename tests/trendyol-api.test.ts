import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchTrendyolOrders, mapOrdersToUserRawRows, TrendyolAuthError, TrendyolApiError, TrendyolMappingError,
} from "../lib/trendyol-api/client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("Trendyol API client — real order fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws TrendyolAuthError on a real 401 from Trendyol (wrong credentials)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401)));

    await expect(
      fetchTrendyolOrders({ sellerId: "bad", apiKey: "wrong", apiSecret: "wrong" })
    ).rejects.toBeInstanceOf(TrendyolAuthError);
  });

  it("throws TrendyolAuthError on a real 403 from Trendyol", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Forbidden" }, 403)));

    await expect(
      fetchTrendyolOrders({ sellerId: "bad", apiKey: "wrong", apiSecret: "wrong" })
    ).rejects.toBeInstanceOf(TrendyolAuthError);
  });

  it("retries on 429 (rate limit) then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({ content: [], totalPages: 1 }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const orders = await fetchTrendyolOrders({ sellerId: "1", apiKey: "k", apiSecret: "s" });
    expect(orders).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws TrendyolApiError on other non-2xx responses (e.g. 500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500)));

    await expect(
      fetchTrendyolOrders({ sellerId: "1", apiKey: "k", apiSecret: "s" })
    ).rejects.toBeInstanceOf(TrendyolApiError);
  });

  it("sends Basic Auth built from apiKey:apiSecret and the seller User-Agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [], totalPages: 1 }, 200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTrendyolOrders({ sellerId: "12345", apiKey: "myKey", apiSecret: "mySecret" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("apigw.trendyol.com/integration/order/sellers/12345/orders");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("myKey:mySecret").toString("base64")}`);
    expect(headers["User-Agent"]).toBe("12345 - SelfIntegration");
  });

  it("real 401 propagates a user-facing Turkish message (not a generic error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    try {
      await fetchTrendyolOrders({ sellerId: "1", apiKey: "k", apiSecret: "s" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TrendyolAuthError);
      expect((err as Error).message).toMatch(/API bilgileri hatalı/);
    }
  });
});

describe("mapOrdersToUserRawRows — real order data mapping", () => {
  // Field names (stockCode, lineGrossAmount) verified against Trendyol's
  // published getShipmentPackages example response — see client.ts comment.
  it("maps real revenue/units/date via stockCode + lineGrossAmount, defaults cost fields Trendyol can't provide to 0", () => {
    const rows = mapOrdersToUserRawRows([
      {
        orderNumber: "ORD-1",
        orderDate: new Date("2026-06-15T10:00:00Z").getTime(),
        lines: [
          { stockCode: "SKU-A", quantity: 2, lineGrossAmount: 500 },
          { stockCode: "SKU-B", quantity: 1, lineUnitPrice: 100 },
        ],
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      order_id: "ORD-1",
      sku: "SKU-A",
      units: 2,
      gross_revenue: 500,
      unit_cost: 0,
      shipping: 0,
      return_rate: 0,
      ad_spend: 0,
      marketplace: "trendyol",
      sale_date: "2026-06-15",
    });
    expect(rows[1].sku).toBe("SKU-B");
    expect(rows[1].gross_revenue).toBe(100);
  });

  it("falls back to merchantSku/sku/barcode and amount/price for older API revisions", () => {
    const rows = mapOrdersToUserRawRows([
      {
        orderNumber: "ORD-LEGACY",
        lines: [
          { merchantSku: "LEGACY-SKU", quantity: 1, amount: 250 },
          { sku: "PLAIN-SKU", quantity: 1, price: 75 },
          { barcode: "BARCODE-SKU", quantity: 1, lineGrossAmount: 30 },
        ],
      },
    ]);
    expect(rows.map((r) => r.sku)).toEqual(["LEGACY-SKU", "PLAIN-SKU", "BARCODE-SKU"]);
    expect(rows.map((r) => r.gross_revenue)).toEqual([250, 75, 30]);
  });

  it("skips lines with no sku or zero/negative revenue", () => {
    const rows = mapOrdersToUserRawRows([
      {
        orderNumber: "ORD-2",
        lines: [
          { stockCode: "", quantity: 1, lineGrossAmount: 100 },
          { stockCode: "OK-SKU", quantity: 1, lineGrossAmount: 0 },
          { stockCode: "REAL-SKU", quantity: 1, lineGrossAmount: 50 },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("REAL-SKU");
  });

  // This is the EXACT example response Trendyol publishes for
  // getShipmentPackages (developers.trendyol.com/v3.0/docs/2-get-shipment-packages),
  // field-for-field — not a hand-picked shape. If a future edit to the mapper
  // regresses on real Trendyol data, this is the test that catches it.
  it("maps Trendyol's own published getShipmentPackages example response correctly", () => {
    const realTrendyolExampleOrder = {
      shipmentPackageId: 3330111111,
      orderNumber: "10654411111",
      orderDate: 1762253333685,
      shipmentPackageStatus: "Delivered",
      lines: [
        {
          quantity: 1,
          stockCode: "111111",
          productName: "Kuş ve Çiçek Desenli Tepsi - Yeşil / Altın Sarısı - 49 cm, 01SYM134, Tek Ebat",
          lineGrossAmount: 498.9,
          lineUnitPrice: 498.9,
          lineTotalDiscount: 0.0,
          barcode: "8683772071724",
          lineId: 4765111111,
          contentId: 1239111111,
        },
      ],
    };

    const rows = mapOrdersToUserRawRows([realTrendyolExampleOrder]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: "10654411111",
      sku: "111111",
      units: 1,
      gross_revenue: 498.9,
      unit_cost: 0,
      shipping: 0,
      return_rate: 0,
      ad_spend: 0,
      marketplace: "trendyol",
      sale_date: new Date(1762253333685).toISOString().slice(0, 10),
    });
  });

  // The dangerous scenario this whole fix exists for: Trendyol renames its
  // fields again (or we simply guessed wrong) and every line fails to map.
  // The function must NEVER return an empty array silently in that case —
  // it must throw, so the caller (app/api/trendyol/connect/route.ts) reports
  // a real error instead of a fake "connected, 0 rows" success.
  it("THROWS TrendyolMappingError instead of silently returning [] when order lines exist but none map (schema mismatch)", () => {
    const ordersWithUnknownSchema = [
      {
        orderNumber: "ORD-FUTURE-SCHEMA",
        lines: [
          // None of these keys are anything mapOrdersToUserRawRows recognizes —
          // simulates Trendyol shipping a future, renamed response shape.
          { itemCode: "SOME-SKU", qty: 3, totalPrice: 999 },
        ],
      },
    ] as unknown as Parameters<typeof mapOrdersToUserRawRows>[0];

    expect(() => mapOrdersToUserRawRows(ordersWithUnknownSchema)).toThrow(TrendyolMappingError);
  });

  it("does NOT throw for a genuinely empty result (no orders in range — legitimate, not a bug)", () => {
    expect(mapOrdersToUserRawRows([])).toEqual([]);
    expect(mapOrdersToUserRawRows([{ orderNumber: "ORD-EMPTY", lines: [] }])).toEqual([]);
  });
});
