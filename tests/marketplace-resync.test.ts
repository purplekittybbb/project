import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";

// resyncMarketplace decrypts stored credentials, so a stable encryption key
// must be set BEFORE lib/security/crypto is imported (it reads the env var
// lazily inside deriveKey(), but setting it up front keeps every test
// deterministic regardless of import order).
beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "test-only-key-for-marketplace-resync-tests";
});

import { resyncMarketplace, isResyncableMarketplace, RESYNCABLE_MARKETPLACES } from "../lib/marketplace-resync";
import { encryptSecret } from "../lib/security/crypto";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

interface CredentialFixture {
  marketplace: string;
  seller_id: string;
  api_key_encrypted: string;
  api_secret_encrypted: string;
}

interface StoredRow {
  order_id: string;
  marketplace: string;
  user_id: string;
  [key: string]: unknown;
}

/**
 * Stateful fluent Supabase mock covering exactly the calls resyncMarketplace
 * makes: a single-row credential lookup, an existing-order_id select (for
 * de-dupe), and an insert against user_transactions. user_transactions is
 * backed by a real in-memory array so calling resyncMarketplace TWICE
 * against the same mock genuinely proves idempotency, the same way the
 * hourly cron running twice must never duplicate a row.
 */
function makeSupabaseMock(opts: {
  credentialRow?: CredentialFixture | null;
  credentialFetchError?: { message: string } | null;
  existingRows?: StoredRow[];
  existingFetchError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const store: StoredRow[] = [...(opts.existingRows ?? [])];
  let lastInsertedPayload: StoredRow[] | null = null;

  const supabase = {
    from(table: string) {
      if (table === "marketplace_credentials") {
        return {
          select() {
            return {
              eq(col1: string, val1: string) {
                return {
                  eq(col2: string, val2: string) {
                    return {
                      async maybeSingle() {
                        void col1; void val1; void col2; void val2;
                        return {
                          data: opts.credentialRow ?? null,
                          error: opts.credentialFetchError ?? null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(_payload: Record<string, unknown>) {
            void _payload;
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "user_transactions") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              eq(col1: string, val1: string) {
                return {
                  async eq(col2: string, val2: string) {
                    if (opts.existingFetchError) return { data: null, error: opts.existingFetchError };
                    const matches = store.filter((r) => r[col1] === val1 && r[col2] === val2);
                    return { data: matches.map((r) => ({ order_id: r.order_id })), error: null };
                  },
                };
              },
            };
          },
          insert(payload: StoredRow[]) {
            lastInsertedPayload = payload;
            if (opts.insertError) return Promise.resolve({ error: opts.insertError });
            store.push(...payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table in test mock: ${table}`);
    },
  };

  return {
    supabase: supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
    getStore: () => store,
    getLastInsertedPayload: () => lastInsertedPayload,
  };
}

function credFixture(marketplace: string, sellerId: string, apiKey: string, apiSecret: string): CredentialFixture {
  return {
    marketplace,
    seller_id: sellerId,
    api_key_encrypted: encryptSecret(apiKey),
    api_secret_encrypted: encryptSecret(apiSecret),
  };
}

describe("isResyncableMarketplace", () => {
  it("recognizes exactly the four real-integration marketplaces", () => {
    expect(RESYNCABLE_MARKETPLACES).toEqual(["trendyol", "hepsiburada", "n11", "shopify"]);
    for (const mp of RESYNCABLE_MARKETPLACES) expect(isResyncableMarketplace(mp)).toBe(true);
  });

  it("rejects marketplaces with no real credential-based integration", () => {
    expect(isResyncableMarketplace("ebay")).toBe(false);
    expect(isResyncableMarketplace("manual_csv")).toBe(false);
    expect(isResyncableMarketplace("amazon_us")).toBe(false);
  });
});

describe("resyncMarketplace — the read side of marketplace_credentials", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails cleanly (no crash) when there is no stored credential for this marketplace", async () => {
    const { supabase } = makeSupabaseMock({ credentialRow: null });
    const result = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.authError).toBe(false);
      expect(result.error).toMatch(/bulunamadı/);
    }
  });

  it("rejects an unknown/non-resyncable marketplace before touching the database", async () => {
    const { supabase } = makeSupabaseMock({ credentialRow: null });
    const result = await resyncMarketplace(supabase, "user-1", "ebay");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Bilinmeyen pazar yeri/);
  });

  it("Trendyol: decrypts stored credentials, refetches real orders, and APPENDS them to user_transactions", async () => {
    const cred = credFixture("trendyol", "12345", "realKey", "realSecret");
    const { supabase, getStore, getLastInsertedPayload } = makeSupabaseMock({ credentialRow: cred });

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [
          { orderNumber: "ORD-1", orderDate: Date.parse("2026-06-15"), lines: [{ stockCode: "SKU-A", quantity: 2, lineGrossAmount: 500 }] },
        ],
        totalPages: 1,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resyncMarketplace(supabase, "user-1", "trendyol");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.marketplace).toBe("trendyol");
      expect(result.ordersFetched).toBe(1);
      expect(result.rowsSaved).toBe(1);
      expect(result.duplicatesSkipped).toBe(0);
    }

    // The real API was hit with the DECRYPTED credentials, never the ciphertext.
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("realKey:realSecret").toString("base64")}`);

    expect(getStore()).toHaveLength(1);
    const payload = getLastInsertedPayload() as unknown as { sku: string; marketplace: string; user_id: string }[];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ sku: "SKU-A", marketplace: "trendyol", user_id: "user-1" });
  });

  it("CRITICAL — calling resyncMarketplace TWICE with the same vendor response never duplicates the order (idempotency for the hourly cron)", async () => {
    const cred = credFixture("trendyol", "12345", "realKey", "realSecret");
    const { supabase, getStore } = makeSupabaseMock({ credentialRow: cred });

    const vendorResponse = jsonResponse({
      content: [
        { orderNumber: "ORD-SAME", orderDate: Date.parse("2026-06-15"), lines: [{ stockCode: "SKU-A", quantity: 1, lineGrossAmount: 100 }] },
      ],
      totalPages: 1,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(vendorResponse));

    const first = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(first.success).toBe(true);
    if (first.success) {
      expect(first.rowsSaved).toBe(1);
      expect(first.duplicatesSkipped).toBe(0);
    }
    expect(getStore()).toHaveLength(1);

    // Simulates the exact scenario the task calls out: the same cron run (or
    // the cron firing again next hour, or a manual Refresh in between) sees
    // Trendyol return the SAME order again.
    const second = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.ordersFetched).toBe(1);
      expect(second.rowsSaved).toBe(0); // nothing NEW was inserted
      expect(second.duplicatesSkipped).toBe(1); // the repeat was recognized and skipped
    }
    expect(getStore()).toHaveLength(1); // still exactly one row — no duplicate
  });

  it("a genuinely NEW order alongside an already-synced one only inserts the new one", async () => {
    const cred = credFixture("trendyol", "12345", "realKey", "realSecret");
    const { supabase, getStore } = makeSupabaseMock({
      credentialRow: cred,
      existingRows: [{ order_id: "ORD-OLD", marketplace: "trendyol", user_id: "user-1", sku: "SKU-A" }],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [
            { orderNumber: "ORD-OLD", lines: [{ stockCode: "SKU-A", quantity: 1, lineGrossAmount: 100 }] }, // vendor still returns this — already have it
            { orderNumber: "ORD-NEW", lines: [{ stockCode: "SKU-B", quantity: 1, lineGrossAmount: 200 }] }, // a genuinely new order
          ],
          totalPages: 1,
        })
      )
    );

    const result = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rowsSaved).toBe(1);
      expect(result.duplicatesSkipped).toBe(1);
    }
    expect(getStore()).toHaveLength(2);
    expect(getStore().map((r) => r.order_id).sort()).toEqual(["ORD-NEW", "ORD-OLD"]);
  });

  it("Trendyol: a revoked/expired stored key surfaces as authError (caller should show the reconnect form)", async () => {
    const cred = credFixture("trendyol", "12345", "nowInvalidKey", "nowInvalidSecret");
    const { supabase } = makeSupabaseMock({ credentialRow: cred });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    const result = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.authError).toBe(true);
      expect(result.error).toMatch(/API bilgileri hatalı/);
    }
  });

  it("Hepsiburada: routes through the same resync path with merchantId as seller_id", async () => {
    const cred = credFixture("hepsiburada", "merchant-9", "hbKey", "hbSecret");
    const { supabase, getStore } = makeSupabaseMock({ credentialRow: cred });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([{ orderNumber: "HB-1", lineItems: [{ sku: "HB-SKU", quantity: 1, totalPrice: { amount: 100 } }] }])
      )
    );

    const result = await resyncMarketplace(supabase, "user-1", "hepsiburada");
    expect(result.success).toBe(true);
    if (result.success) expect(result.rowsSaved).toBe(1);
    expect(getStore()[0].marketplace).toBe("hepsiburada");
  });

  it("N11: routes through the same resync path using appKey/appSecret", async () => {
    const cred = credFixture("n11", "myAppKey", "myAppKey", "myAppSecret");
    const { supabase, getStore } = makeSupabaseMock({ credentialRow: cred });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ content: [{ orderNumber: "N11-1", lines: [{ stockCode: "N11-SKU", quantity: 1, lineGrossAmount: 80 }] }], totalPages: 1 }))
    );

    const result = await resyncMarketplace(supabase, "user-1", "n11");
    expect(result.success).toBe(true);
    expect(getStore()[0].marketplace).toBe("n11");
  });

  it("Shopify: uses seller_id as the shop domain and api_key_encrypted as the OAuth access token", async () => {
    const cred = credFixture("shopify", "mystore.myshopify.com", "shpat_realtoken", "");
    const { supabase, getStore } = makeSupabaseMock({ credentialRow: cred });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          orders: {
            edges: [
              {
                node: {
                  name: "#2001",
                  lineItems: {
                    edges: [{ node: { quantity: 1, variant: { sku: "SHOP-SKU" }, originalUnitPriceSet: { shopMoney: { amount: "20.00" } } } }],
                  },
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resyncMarketplace(supabase, "user-1", "shopify");
    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("mystore.myshopify.com");
    expect((init as RequestInit & { headers: Record<string, string> }).headers["X-Shopify-Access-Token"]).toBe("shpat_realtoken");
    expect(getStore()[0].marketplace).toBe("shopify");
  });

  it("aborts and reports an error if reading existing rows for de-dupe fails (never inserts blind)", async () => {
    const cred = credFixture("trendyol", "12345", "realKey", "realSecret");
    const { supabase } = makeSupabaseMock({ credentialRow: cred, existingFetchError: { message: "db down" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [], totalPages: 1 })));

    const result = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/okunamadı/);
  });

  it("reports an error (without crashing) if the insert itself fails", async () => {
    const cred = credFixture("trendyol", "12345", "realKey", "realSecret");
    const { supabase } = makeSupabaseMock({ credentialRow: cred, insertError: { message: "db down" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [{ orderNumber: "ORD-1", lines: [{ stockCode: "SKU-A", quantity: 1, lineGrossAmount: 50 }] }], totalPages: 1 })));

    const result = await resyncMarketplace(supabase, "user-1", "trendyol");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/kaydedilemedi/);
  });
});
