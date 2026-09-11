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
  it("maps the documented REST GetShipmentPackages sample (sellerInvoiceAmount + lastModifiedDate)", () => {
    // Field names from magazadestek.n11.com RestAPI Sipariş Listeleme sample.
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "203872347637",
        id: "112999455244259",
        lastModifiedDate: 1724323386203,
        lines: [
          {
            quantity: 2,
            stockCode: "20242024",
            price: 292.8,
            dueAmount: 536.2,
            sellerInvoiceAmount: 579.8,
            totalSellerDiscountPrice: 5.8,
          },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: "203872347637",
      sku: "20242024",
      units: 2,
      gross_revenue: 579.8,
      sale_date: "2024-08-22",
      marketplace: "n11",
    });
  });

  it("prefers dueAmount over unit price when sellerInvoiceAmount is absent", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-ORD-1",
        lines: [{ stockCode: "SKU-A", quantity: 2, price: 100, dueAmount: 190 }],
      },
    ]);
    expect(rows[0].gross_revenue).toBe(190);
  });

  it("populates barcode and product_name when N11 sends them", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-BC",
        lines: [{
          stockCode: "SKU-BC",
          quantity: 1,
          sellerInvoiceAmount: 100,
          productName: "Bluetooth Kulaklık",
          barcode: "8683772071724",
        }],
      },
    ]);
    expect(rows[0].barcode).toBe("8683772071724");
    expect(rows[0].product_name).toBe("Bluetooth Kulaklık");
  });

  it("uses price × quantity when only unit price is present (never treats price as line total)", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-ORD-PRICE",
        lines: [{ stockCode: "SKU-P", quantity: 3, price: 50 }],
      },
    ]);
    expect(rows[0].gross_revenue).toBe(150);
  });

  it("falls back to legacy aliases (productSellerCode / lineGrossAmount / amount)", () => {
    expect(
      mapN11OrdersToUserRawRows([
        { orderNumber: "N11-ORD-2", orderItemList: [{ productSellerCode: "LEGACY-SKU", quantity: 1, dueAmount: 250 }] },
      ])[0]
    ).toMatchObject({ sku: "LEGACY-SKU", gross_revenue: 250 });

    expect(
      mapN11OrdersToUserRawRows([
        { orderNumber: "N11-ORD-3", lines: [{ stockCode: "SKU-LG", quantity: 1, lineGrossAmount: 500 }] },
      ])[0]
    ).toMatchObject({ sku: "SKU-LG", gross_revenue: 500 });

    expect(
      mapN11OrdersToUserRawRows([
        { orderNumber: "N11-ORD-4", lineItems: [{ sku: "GENERIC-SKU", quantity: 1, amount: 75 }] },
      ])[0]
    ).toMatchObject({ sku: "GENERIC-SKU", gross_revenue: 75 });
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

  it("extracts a real category (line-level, then order-level) instead of always 'Diğer'", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-CAT-1",
        categoryName: "Ev & Yaşam", // order-level fallback
        lines: [
          { stockCode: "L-CAT", quantity: 1, dueAmount: 100, categoryName: "Elektronik" },
          { stockCode: "O-CAT", quantity: 1, dueAmount: 120 }, // inherits order category
        ],
      },
    ]);
    expect(rows.find((r) => r.sku === "L-CAT")?.category).toBe("Elektronik");
    expect(rows.find((r) => r.sku === "O-CAT")?.category).toBe("Ev & Yaşam");
  });

  it("defaults to 'Diğer' when no category is present anywhere", () => {
    const rows = mapN11OrdersToUserRawRows([
      { orderNumber: "N11-NOCAT", lines: [{ stockCode: "X", quantity: 1, dueAmount: 50 }] },
    ]);
    expect(rows[0].category).toBe("Diğer");
  });

  it("folds a leaf path onto the internal taxonomy", () => {
    const rows = mapN11OrdersToUserRawRows([
      {
        orderNumber: "N11-LEAF",
        lines: [{ stockCode: "LEAF", quantity: 1, dueAmount: 80, categoryName: "Elektronik/Kulaklık" }],
      },
    ]);
    expect(rows[0].category).toBe("Elektronik");
  });

  it("skips cancelled/rejected shipment packages so a non-sale never inflates revenue", () => {
    const rows = mapN11OrdersToUserRawRows([
      { orderNumber: "N11-CANCEL", shipmentStatus: "Cancelled", lines: [{ stockCode: "C-1", quantity: 1, dueAmount: 999 }] },
      { orderNumber: "N11-IPTAL", status: "İptal Edildi", lines: [{ stockCode: "C-2", quantity: 1, dueAmount: 999 }] },
      { orderNumber: "N11-RED", status: "Reddedildi", lines: [{ stockCode: "C-3", quantity: 1, dueAmount: 999 }] },
      { orderNumber: "N11-OK", shipmentStatus: "Delivered", lines: [{ stockCode: "OK", quantity: 1, dueAmount: 200 }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("OK");
  });

  it("a cancelled package with an unmappable schema does NOT trigger N11MappingError", () => {
    const orders = [
      { orderNumber: "N11-CANCEL-UNMAPPED", shipmentStatus: "Rejected", lines: [{ itemCode: "??", qty: 1, totalCost: 5 }] },
    ] as unknown as Parameters<typeof mapN11OrdersToUserRawRows>[0];
    expect(mapN11OrdersToUserRawRows(orders)).toEqual([]);
  });
});
