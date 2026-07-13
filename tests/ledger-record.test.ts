import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildUserSeller } from "../lib/supabase/user-data";
import { deriveUnderwritingInputsFromTransactions } from "../lib/data/seed";
import { trueMarginModel } from "../lib/domain/underwriting";
import type { Currency } from "../lib/domain/canonical";

// POST /api/ledger/record creates its own user-scoped Supabase client via
// createClient(url, anonKey, { headers: Authorization }) — mock the module so
// this test never needs a real Supabase project.
//
// The read-compare-insert against decision_ledger now happens atomically
// inside a single Postgres function, record_decision_if_changed (see
// supabase/migrations/0006_decision_ledger_atomic_record.sql) — the route
// just calls it via .rpc() and trusts the boolean it returns, so the mock
// only needs to fake that one call, not the table reads/inserts it replaced.
const mockGetUser = vi.fn();
const mockUserTransactionsSelect = vi.fn();
const mockRpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "user_transactions") return { select: () => mockUserTransactionsSelect() };
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  })),
}));

async function importRoute() {
  return import("../app/api/ledger/record/route");
}

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/ledger/record", { method: "POST", headers });
}

const RAW_ROWS = [
  { order_id: "1", sku: "SKU1", category: "Elektronik", sale_date: "2024-01-05", units: 10, gross_revenue: 10000, unit_cost: 4000, shipping: 200, return_rate: 0.05, ad_spend: 300, marketplace: "trendyol" },
  { order_id: "2", sku: "SKU2", category: "Elektronik", sale_date: "2024-02-05", units: 8, gross_revenue: 8000, unit_cost: 3000, shipping: 150, return_rate: 0.05, ad_spend: 200, marketplace: "trendyol" },
];

/** The exact decision the route SHOULD compute for RAW_ROWS — derived from the
 *  same real (unmocked) domain functions the route itself calls, so this test
 *  never hardcodes a number that would silently drift from the real formula. */
function expectedDecision(userId: string) {
  const seller = buildUserSeller(RAW_ROWS, userId)!;
  const currency = (seller.transactions[0]?.currency ?? "TRY") as Currency;
  const inputs = deriveUnderwritingInputsFromTransactions(seller.transactions, seller.tenureMonths);
  return trueMarginModel(userId, inputs, currency);
}

describe("POST /api/ledger/record", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockUserTransactionsSelect.mockReset();
    mockRpc.mockReset();
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" };
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockUserTransactionsSelect.mockResolvedValue({ data: RAW_ROWS, error: null });
    // Default: the RPC reports it inserted a row (no prior decision).
    mockRpc.mockResolvedValue({ data: true, error: null });
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects a request with no Authorization header", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockUserTransactionsSelect).not.toHaveBeenCalled();
  });

  it("rejects when the session is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer bad-token"));
    expect(res.status).toBe(401);
  });

  it("records nothing when the user has no transactions yet", async () => {
    mockUserTransactionsSelect.mockResolvedValue({ data: [], error: null });
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer token"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recorded).toBe(false);
    expect(json.reason).toBe("no_data");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("records a first decision when no prior ledger row exists", async () => {
    const decision = expectedDecision("user-1");
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer token"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recorded).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [fn, params] = mockRpc.mock.calls[0];
    expect(fn).toBe("record_decision_if_changed");
    expect(params).toMatchObject({
      p_tenant_id: "user-1",
      p_approved_limit: decision.approvedLimit,
      p_take_rate: decision.takeRate,
      p_currency: decision.currency,
    });
  });

  it("does NOT report a new record when the RPC says the decision is unchanged (idempotent)", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer token"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recorded).toBe(false);
  });

  it("reports a new record when the RPC says it inserted a row", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer token"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recorded).toBe(true);
  });

  it("returns 502 (not a crash) when user_transactions can't be read", async () => {
    mockUserTransactionsSelect.mockResolvedValue({ data: null, error: new Error("boom") });
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer token"));
    expect(res.status).toBe(502);
  });

  it("returns 200 with rpc_unavailable when the atomic RPC fails (migration not applied)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("function record_decision_if_changed does not exist") });
    const { POST } = await importRoute();
    const res = await POST(makeRequest("Bearer token"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recorded).toBe(false);
    expect(json.reason).toBe("rpc_unavailable");
  });
});
