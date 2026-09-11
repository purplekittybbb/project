import { describe, expect, it, vi, afterEach } from "vitest";
import { AmazonTrAdapter, REPRESENTATIVE_AMAZON_TR_FEES } from "@/lib/adapters/amazon-tr";
import {
  AMAZON_TR_MARKETPLACE_ID,
  SP_API_EU_ENDPOINT,
  amazonTrConsentUrl,
} from "@/lib/amazon-sp-api/constants";
import { exchangeAuthorizationCode, AmazonLwaError } from "@/lib/amazon-sp-api/lwa";
import {
  mapAmazonOrdersToUserRawRows,
  fetchAmazonTrOrders,
  AmazonMappingError,
} from "@/lib/amazon-sp-api/client";
import {
  assertAmazonOrdersLiveAllowed,
  AmazonLiveGuardError,
  isAmazonSpApiLiveEnabled,
} from "@/lib/amazon-sp-api/live";

describe("Amazon TR constants (official SP-API docs)", () => {
  it("uses Turkey marketplace id A33AVAJ2PDY3EV and EU endpoint", () => {
    expect(AMAZON_TR_MARKETPLACE_ID).toBe("A33AVAJ2PDY3EV");
    expect(SP_API_EU_ENDPOINT).toBe("https://sellingpartnerapi-eu.amazon.com");
  });

  it("builds Seller Central TR consent URL with application_id + state", () => {
    const url = amazonTrConsentUrl({ applicationId: "amzn1.app.x", state: "abc", draft: true });
    expect(url).toContain("sellercentral.amazon.com.tr/apps/authorize/consent");
    expect(url).toContain("application_id=amzn1.app.x");
    expect(url).toContain("state=abc");
    expect(url).toContain("version=beta");
  });
});

describe("AmazonTrAdapter", () => {
  it("uses vat-included-plus-service-vat and TRY", () => {
    expect(REPRESENTATIVE_AMAZON_TR_FEES.commissionBasis).toBe("vat-included-plus-service-vat");
    const adapter = new AmazonTrAdapter();
    expect(adapter.marketplace).toBe("amazon_tr");
    expect(adapter.currency).toBe("TRY");
  });

  it("referral 15% on 1200 + 20% service VAT → 180 + 36", () => {
    const adapter = new AmazonTrAdapter();
    const [tx] = adapter.toCanonical("t", [
      {
        orderId: "AMZ-1",
        sku: "S",
        category: "Ev & Yaşam",
        saleDate: "2026-09-01",
        units: 1,
        grossRevenue: 1200,
        unitCost: 400,
        fbaFee: 50,
        returnRate: 0,
        adSpend: 0,
      },
    ]);
    expect(tx.fees.commission).toBeCloseTo(180, 10);
    expect(tx.fees.vat).toBeCloseTo(36, 10);
    expect(tx.fees.shipping).toBe(50);
  });
});

describe("mapAmazonOrdersToUserRawRows", () => {
  it("maps a documented Orders v0 line and skips Canceled", () => {
    const rows = mapAmazonOrdersToUserRawRows([
      {
        AmazonOrderId: "123-1",
        PurchaseDate: "2026-09-01T10:00:00Z",
        OrderStatus: "Shipped",
        OrderItems: [
          { SellerSKU: "SKU-A", ASIN: "B00X", Title: "Kulaklık", QuantityOrdered: 2, ItemPrice: { Amount: "400.00", CurrencyCode: "TRY" } },
        ],
      },
      {
        AmazonOrderId: "123-CANCEL",
        OrderStatus: "Canceled",
        OrderItems: [
          { SellerSKU: "NO", QuantityOrdered: 1, ItemPrice: { Amount: "99" } },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: "123-1",
      sku: "SKU-A",
      units: 2,
      gross_revenue: 400,
      marketplace: "amazon_tr",
      barcode: "B00X",
    });
  });

  it("throws AmazonMappingError when lines exist but none map", () => {
    expect(() =>
      mapAmazonOrdersToUserRawRows([
        { AmazonOrderId: "X", OrderStatus: "Shipped", OrderItems: [{ Title: "no sku no price" }] },
      ]),
    ).toThrow(AmazonMappingError);
  });
});

describe("Amazon live guard", () => {
  const prev = process.env.AMAZON_SP_API_LIVE_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.AMAZON_SP_API_LIVE_ENABLED;
    else process.env.AMAZON_SP_API_LIVE_ENABLED = prev;
  });

  it("is off by default and blocks fetchAmazonTrOrders", async () => {
    delete process.env.AMAZON_SP_API_LIVE_ENABLED;
    expect(isAmazonSpApiLiveEnabled()).toBe(false);
    expect(() => assertAmazonOrdersLiveAllowed()).toThrow(AmazonLiveGuardError);
    await expect(
      fetchAmazonTrOrders({
        refreshToken: "x",
        clientId: "id",
        clientSecret: "s",
        createdAfterIso: "2026-08-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(AmazonLiveGuardError);
  });
});

describe("LWA token exchange (mocked fetch — no live Amazon)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exchanges authorization_code against api.amazon.com/auth/o2/token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: "Atza|x",
          refresh_token: "Atzr|y",
          expires_in: 3600,
          token_type: "bearer",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeAuthorizationCode({
      code: "Splxl",
      redirectUri: "https://example.com/api/amazon/oauth/callback",
      clientId: "foodev",
      clientSecret: "secret",
    });
    expect(tokens.refreshToken).toBe("Atzr|y");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("api.amazon.com/auth/o2/token");
    expect(String(init.body)).toContain("grant_type=authorization_code");
  });

  it("throws AmazonLwaError on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => "denied",
    }));
    await expect(
      exchangeAuthorizationCode({
        code: "bad",
        redirectUri: "https://example.com/cb",
        clientId: "id",
        clientSecret: "s",
      }),
    ).rejects.toBeInstanceOf(AmazonLwaError);
  });
});
