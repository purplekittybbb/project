import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchN11Orders, mapN11OrdersToUserRawRows, N11AuthError, N11ApiError, N11MappingError,
} from "../lib/n11-api/client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("N11 API client — real order fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws N11AuthError on a real 401 from N11 (wrong credentials)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401)));

    await expect(
      fetchN11Orders({ appKey: "wrong", appSecret: "wrong" })
    ).rejects.toBeInstanceOf(N11AuthError);
  });

  it("throws N11AuthError on a real 403 from N11", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Forbidden" }, 403)));

    await expect(
      fetchN11Orders({ appKey: "wrong", appSecret: "wrong" })
    ).rejects.toBeInstanceOf(N11AuthError);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({ content: [], totalPages: 1 }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const orders = await fetchN11Orders({ appKey: "k", appSecret: "s" });
    expect(orders).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws N11ApiError on other non-2xx responses (e.g. 500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500)));

    await expect(fetchN11Orders({ appKey: "k", appSecret: "s" })).rejects.toBeInstanceOf(N11ApiError);
  });

  it("sends appkey/appsecret headers (NOT Basic Auth) per N11's documented auth scheme", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [], totalPages: 1 }, 200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchN11Orders({ appKey: "myAppKey", appSecret: "myAppSecret" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("api.n11.com/rest/delivery/v1/shipmentPackages");
    const headers = init.headers as Record<string, string>;
    expect(headers.appkey).toBe("myAppKey");
    expect(headers.appsecret).toBe("myAppSecret");
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("mapN11OrdersToUserRawRows — real order data mapping", () => {
  it("maps via the Trendyol-style guess (stockCode/lineGrossAmount) when present", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-ORD-1",
        lines: [{ stockCode: "SKU-A", quantity: 2, lineGrossAmount: 500 }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: "N11-ORD-1", sku: "SKU-A", units: 2, gross_revenue: 500,
      unit_cost: 0, shipping: 0, return_rate: 0, ad_spend: 0, marketplace: "n11",
    });
  });

  it("falls back to the SOAP-era field names (productSellerCode/dueAmount) when those come back instead", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-ORD-2",
        orderItemList: [{ productSellerCode: "LEGACY-SKU", quantity: 1, dueAmount: 250 }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "LEGACY-SKU", gross_revenue: 250 });
  });

  it("falls back further to generic sku/amount when neither guess chain matches", () => {
    const rows = mapN11OrdersToUserRawRows([
      { orderNumber: "N11-ORD-3", lineItems: [{ sku: "GENERIC-SKU", quantity: 1, amount: 75 }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "GENERIC-SKU", gross_revenue: 75 });
  });

  it("skips lines with no sku or zero/negative revenue", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-ORD-4",
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

  // The most important test in this file given N11's LOW field-name
  // confidence (documented in client.ts) — if every guess in the fallback
  // chain is wrong for a real account's response shape, this must throw
  // loudly, not silently report a "successful" empty sync.
  it("THROWS N11MappingError instead of silently returning [] when order lines exist but none map (all guesses wrong)", () => {
    const ordersWithUnknownSchema = [
      { orderNumber: "ORD-FUTURE-SCHEMA", lines: [{ itemCode: "SOME-SKU", qty: 3, totalCost: 999 }] },
    ] as unknown as Parameters<typeof mapN11OrdersToUserRawRows>[0];

    expect(() => mapN11OrdersToUserRawRows(ordersWithUnknownSchema)).toThrow(N11MappingError);
  });

  it("does NOT throw for a genuinely empty result (no orders — legitimate, not a bug)", () => {
    expect(mapN11OrdersToUserRawRows([])).toEqual([]);
    expect(mapN11OrdersToUserRawRows([{ orderNumber: "ORD-EMPTY", lines: [] }])).toEqual([]);
  });
});
