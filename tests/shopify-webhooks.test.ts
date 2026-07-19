import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

const mockSave = vi.fn();
vi.mock("../lib/save-user-transactions", () => ({
  saveDedupedTransactions: (...args: unknown[]) => mockSave(...args),
}));

const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
vi.mock("../lib/marketplace-sync-status", () => ({
  recordSyncSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
  recordSyncFailure: (...args: unknown[]) => mockRecordFailure(...args),
}));

async function importRoute() {
  return import("../app/api/shopify/webhooks/route");
}

function signedRequest(opts: {
  body: string;
  topic: string;
  shop: string;
  secret: string;
  badHmac?: boolean;
}) {
  const hmac = opts.badHmac
    ? "not-a-valid-hmac"
    : createHmac("sha256", opts.secret).update(opts.body, "utf8").digest("base64");
  return new Request("http://localhost/api/shopify/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-topic": opts.topic,
      "x-shopify-shop-domain": opts.shop,
    },
    body: opts.body,
  });
}

describe("POST /api/shopify/webhooks", () => {
  const ORIGINAL_ENV = { ...process.env };
  const secret = "test-shopify-client-secret";

  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockSave.mockReset();
    mockRecordSuccess.mockReset();
    mockRecordFailure.mockReset();
    process.env = {
      ...ORIGINAL_ENV,
      SHOPIFY_CLIENT_SECRET: secret,
      SUPABASE_SERVICE_ROLE_KEY: "svc",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("rejects invalid HMAC before touching the database", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      signedRequest({
        body: "{}",
        topic: "orders/create",
        shop: "a.myshopify.com",
        secret,
        badHmac: true,
      })
    );
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes credentials on app/uninstalled", async () => {
    const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
    const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "marketplace_credentials") {
        return { delete: () => ({ eq: deleteEq1 }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { POST } = await importRoute();
    const res = await POST(
      signedRequest({
        body: "{}",
        topic: "app/uninstalled",
        shop: "gone.myshopify.com",
        secret,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("credentials_deleted");
    expect(deleteEq1).toHaveBeenCalledWith("marketplace", "shopify");
    expect(deleteEq2).toHaveBeenCalledWith("seller_id", "gone.myshopify.com");
  });

  it("syncs a new order when credentials exist for the shop", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "marketplace_credentials") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { user_id: "user-1", seller_id: "live.myshopify.com" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mockSave.mockResolvedValue({ error: null, rowsSaved: 1, duplicatesSkipped: 0 });

    const body = JSON.stringify({
      name: "#2001",
      created_at: "2026-07-18T12:00:00Z",
      line_items: [{ sku: "SKU-1", quantity: 1, price: "25.00" }],
    });

    const { POST } = await importRoute();
    const res = await POST(
      signedRequest({
        body,
        topic: "orders/create",
        shop: "live.myshopify.com",
        secret,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ action: "synced", rowsSaved: 1 });
    expect(mockSave).toHaveBeenCalled();
    expect(mockRecordSuccess).toHaveBeenCalledWith(expect.anything(), "user-1", "shopify");
  });

  it.each(["customers/data_request", "customers/redact"])(
    "acknowledges %s without touching the database (no customer PII is stored)",
    async (topic) => {
      const { POST } = await importRoute();
      const res = await POST(
        signedRequest({
          body: JSON.stringify({ shop_id: 1, shop_domain: "a.myshopify.com", customer: { id: 99 } }),
          topic,
          shop: "a.myshopify.com",
          secret,
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe("no_customer_data_held");
      expect(mockFrom).not.toHaveBeenCalled();
    }
  );

  it("redacts shop credentials on shop/redact", async () => {
    const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
    const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "marketplace_credentials") {
        return { delete: () => ({ eq: deleteEq1 }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { POST } = await importRoute();
    const res = await POST(
      signedRequest({
        body: JSON.stringify({ shop_id: 1, shop_domain: "old.myshopify.com" }),
        topic: "shop/redact",
        shop: "old.myshopify.com",
        secret,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("shop_data_redacted");
    expect(deleteEq1).toHaveBeenCalledWith("marketplace", "shopify");
    expect(deleteEq2).toHaveBeenCalledWith("seller_id", "old.myshopify.com");
  });
});
