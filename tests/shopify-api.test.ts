import { describe, expect, it, vi, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  isValidShopDomain, normalizeShopDomain, buildAuthorizeUrl, verifyCallbackHmac,
  verifyWebhookHmac, exchangeCodeForToken, fetchShopifyOrders,
  mapShopifyOrdersToUserRawRows, mapShopifyWebhookOrderToUserRawRows,
  ShopifyAuthError, ShopifyApiError, ShopifyMappingError,
} from "../lib/shopify-api/client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("Shopify shop domain helpers", () => {
  it("validates a real .myshopify.com domain", () => {
    expect(isValidShopDomain("mystore.myshopify.com")).toBe(true);
    expect(isValidShopDomain("mystore.com")).toBe(false);
    expect(isValidShopDomain("not a domain")).toBe(false);
  });

  it("normalizes a bare store handle to the full domain", () => {
    expect(normalizeShopDomain("mystore")).toBe("mystore.myshopify.com");
    expect(normalizeShopDomain("mystore.myshopify.com")).toBe("mystore.myshopify.com");
    expect(normalizeShopDomain("https://mystore.myshopify.com/")).toBe("mystore.myshopify.com");
  });
});

describe("buildAuthorizeUrl — real Shopify OAuth URL format", () => {
  it("matches shopify.dev's documented authorize URL template", () => {
    const url = buildAuthorizeUrl({
      shop: "mystore.myshopify.com",
      clientId: "abc123",
      redirectUri: "https://example.com/api/shopify/oauth/callback",
      state: "nonce-xyz",
    });
    expect(url).toContain("https://mystore.myshopify.com/admin/oauth/authorize");
    expect(url).toContain("client_id=abc123");
    expect(url).toContain("scope=read_orders");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fapi%2Fshopify%2Foauth%2Fcallback");
    expect(url).toContain("state=nonce-xyz");
  });
});

describe("verifyCallbackHmac — real Shopify HMAC algorithm", () => {
  it("accepts a correctly-signed callback (sorted params, HMAC-SHA256 with client secret)", () => {
    const secret = "shhh-client-secret";
    const params = new URLSearchParams({
      code: "abc",
      shop: "mystore.myshopify.com",
      state: "nonce-xyz",
      timestamp: "1700000000",
    });
    const message = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("&");
    const validHmac = createHmac("sha256", secret).update(message).digest("hex");
    params.set("hmac", validHmac);

    expect(verifyCallbackHmac(params, secret)).toBe(true);
  });

  it("rejects a forged/tampered callback (wrong hmac)", () => {
    const params = new URLSearchParams({
      code: "abc", shop: "mystore.myshopify.com", state: "nonce-xyz", hmac: "totally-fake-hmac",
    });
    expect(verifyCallbackHmac(params, "shhh-client-secret")).toBe(false);
  });

  it("rejects when hmac is missing entirely", () => {
    const params = new URLSearchParams({ code: "abc", shop: "mystore.myshopify.com" });
    expect(verifyCallbackHmac(params, "shhh-client-secret")).toBe(false);
  });
});

describe("exchangeCodeForToken — real token exchange endpoint", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws ShopifyAuthError on a real 401 (invalid/expired code)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(
      exchangeCodeForToken({ shop: "mystore.myshopify.com", clientId: "c", clientSecret: "s", code: "bad" })
    ).rejects.toBeInstanceOf(ShopifyAuthError);
  });

  it("posts form-encoded client_id/client_secret/code to the documented endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: "tok_123" }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeCodeForToken({
      shop: "mystore.myshopify.com", clientId: "myClient", clientSecret: "mySecret", code: "authcode",
    });

    expect(token).toBe("tok_123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://mystore.myshopify.com/admin/oauth/access_token");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toContain("client_id=myClient");
    expect(init.body).toContain("client_secret=mySecret");
    expect(init.body).toContain("code=authcode");
  });
});

describe("fetchShopifyOrders — real GraphQL Admin API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws ShopifyAuthError on a real 401 from the GraphQL endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(fetchShopifyOrders("mystore.myshopify.com", "bad-token")).rejects.toBeInstanceOf(ShopifyAuthError);
  });

  it("throws ShopifyAuthError when Shopify returns 200 with a GraphQL-level 'Invalid API key' error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ errors: "[API] Invalid API key or access token (unrecognized login or wrong password)" }, 200))
    );
    await expect(fetchShopifyOrders("mystore.myshopify.com", "bad-token")).rejects.toBeInstanceOf(ShopifyAuthError);
  });

  it("posts to the documented GraphQL endpoint with X-Shopify-Access-Token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { orders: { edges: [], pageInfo: { hasNextPage: false } } } }, 200)
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchShopifyOrders("mystore.myshopify.com", "real-token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("mystore.myshopify.com/admin/api/");
    expect(String(url)).toContain("/graphql.json");
    expect(init.headers["X-Shopify-Access-Token"]).toBe("real-token");
  });

  it("throws ShopifyApiError on other GraphQL errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: "some other schema error" }, 200)));
    await expect(fetchShopifyOrders("mystore.myshopify.com", "tok")).rejects.toBeInstanceOf(ShopifyApiError);
  });
});

describe("mapShopifyOrdersToUserRawRows — real order data mapping", () => {
  it("maps real revenue (unitPrice × quantity) via variant.sku + originalUnitPriceSet.shopMoney.amount", () => {
    const rows = mapShopifyOrdersToUserRawRows([
      {
        id: "gid://shopify/Order/1",
        name: "#1001",
        createdAt: "2026-06-15T10:00:00Z",
        lineItems: {
          edges: [
            {
              node: {
                quantity: 2,
                variant: { sku: "SKU-A" },
                originalUnitPriceSet: { shopMoney: { amount: "25.00", currencyCode: "USD" } },
              },
            },
          ],
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: "#1001",
      sku: "SKU-A",
      units: 2,
      gross_revenue: 50, // 25.00 * 2
      unit_cost: 0,
      shipping: 0,
      return_rate: 0,
      ad_spend: 0,
      marketplace: "shopify",
      sale_date: "2026-06-15",
    });
  });

  it("skips lines with no variant sku (e.g. a custom/unlinked line item) or zero revenue", () => {
    const rows = mapShopifyOrdersToUserRawRows([
      {
        name: "#1002",
        lineItems: {
          edges: [
            { node: { quantity: 1, variant: null, originalUnitPriceSet: { shopMoney: { amount: "10.00" } } } },
            { node: { quantity: 1, variant: { sku: "ZERO-SKU" }, originalUnitPriceSet: { shopMoney: { amount: "0.00" } } } },
            { node: { quantity: 1, variant: { sku: "REAL-SKU" }, originalUnitPriceSet: { shopMoney: { amount: "15.00" } } } },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("REAL-SKU");
  });

  // Same protection as every other connector — see TrendyolMappingError.
  it("THROWS ShopifyMappingError instead of silently returning [] when order lines exist but none map (schema mismatch)", () => {
    const ordersWithUnknownSchema = [
      {
        name: "#FUTURE",
        lineItems: { edges: [{ node: { productCode: "SOME-SKU", qty: 3, cost: 999 } }] },
      },
    ] as unknown as Parameters<typeof mapShopifyOrdersToUserRawRows>[0];

    expect(() => mapShopifyOrdersToUserRawRows(ordersWithUnknownSchema)).toThrow(ShopifyMappingError);
  });

  it("does NOT throw for a genuinely empty result (no orders — legitimate, not a bug)", () => {
    expect(mapShopifyOrdersToUserRawRows([])).toEqual([]);
    expect(mapShopifyOrdersToUserRawRows([{ name: "#EMPTY", lineItems: { edges: [] } }])).toEqual([]);
  });
});

describe("verifyWebhookHmac — Shopify webhook body signature", () => {
  it("accepts a correctly signed raw body (base64 HMAC-SHA256)", () => {
    const secret = "shpss_test_secret";
    const body = JSON.stringify({ id: 1, name: "#1001" });
    const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
    expect(verifyWebhookHmac(body, hmac, secret)).toBe(true);
  });

  it("rejects a tampered body or wrong secret", () => {
    const secret = "shpss_test_secret";
    const body = JSON.stringify({ id: 1 });
    const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
    expect(verifyWebhookHmac(body + "x", hmac, secret)).toBe(false);
    expect(verifyWebhookHmac(body, hmac, "wrong")).toBe(false);
    expect(verifyWebhookHmac(body, null, secret)).toBe(false);
  });
});

describe("mapShopifyWebhookOrderToUserRawRows — REST webhook payload", () => {
  it("maps orders/create REST line_items into UserRawRow", () => {
    const rows = mapShopifyWebhookOrderToUserRawRows({
      id: 820982911946154508,
      name: "#1001",
      created_at: "2026-07-18T10:00:00Z",
      line_items: [
        { sku: "WH-SKU-1", quantity: 2, price: "49.50", title: "Widget" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: "#1001",
      sku: "WH-SKU-1",
      units: 2,
      gross_revenue: 99,
      sale_date: "2026-07-18",
      marketplace: "shopify",
    });
  });

  it("throws ShopifyMappingError when lines exist but none have a usable SKU/price", () => {
    expect(() =>
      mapShopifyWebhookOrderToUserRawRows({
        name: "#1002",
        line_items: [{ sku: "", quantity: 1, price: "10.00" }],
      })
    ).toThrow(ShopifyMappingError);
  });
});
