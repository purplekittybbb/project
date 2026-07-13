import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ResyncResult } from "../lib/marketplace-resync";

// Run the loop with no artificial delay in tests — see CRON_SYNC_DELAY_MS in
// the route itself.
process.env.CRON_SYNC_DELAY_MS = "0";

// The route creates its OWN service-role Supabase client via createClient();
// mock the module so tests never need a real Supabase project, and so we
// can hand the route a scripted `marketplace_credentials` table.
const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

// resyncMarketplace itself is unit-tested exhaustively in
// marketplace-resync.test.ts (including real de-dupe behavior against a
// stateful mock) — here we mock it so this file can focus purely on the
// ROUTE's own job: auth, sequencing, per-row error isolation, response shape.
const mockResync = vi.fn<(...args: unknown[]) => Promise<ResyncResult>>();
vi.mock("../lib/marketplace-resync", async () => {
  const actual = await vi.importActual<typeof import("../lib/marketplace-resync")>("../lib/marketplace-resync");
  return { ...actual, resyncMarketplace: mockResync };
});

async function importRoute() {
  return import("../app/api/cron/sync-marketplaces/route");
}

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/sync-marketplaces", { headers });
}

function credentialsTable(rows: { user_id: string; marketplace: string }[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "marketplace_credentials") {
      return { select: () => Promise.resolve({ data: rows, error: null }) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("GET /api/cron/sync-marketplaces", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockResync.mockReset();
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: "test-cron-secret", SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", CRON_SYNC_DELAY_MS: "0" };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects a request with NO Authorization header — never touches the database", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockResync).not.toHaveBeenCalled();
  });

  it("rejects a request with the WRONG secret", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects every request (even a would-be-correct one) if CRON_SECRET itself isn't configured — never fails open", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer anything"));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("with the correct secret, returns 500 (not a crash) when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer test-cron-secret"));
    expect(res.status).toBe(500);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("with the correct secret, syncs every stored connection exactly once, sequentially, and reports totals", async () => {
    credentialsTable([
      { user_id: "user-1", marketplace: "trendyol" },
      { user_id: "user-2", marketplace: "hepsiburada" },
      { user_id: "user-3", marketplace: "n11" },
    ]);
    mockResync.mockImplementation(async (...args: unknown[]) => {
      const marketplace = args[2] as string;
      return {
        success: true, marketplace: marketplace as never, ordersFetched: 2, rowsSaved: 1, duplicatesSkipped: 1,
      };
    });

    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockResync).toHaveBeenCalledTimes(3);
    expect(json.checked).toBe(3);
    expect(json.succeeded).toBe(3);
    expect(json.totalNewRows).toBe(3); // 1 new row per connection
    expect(json.totalDuplicatesSkipped).toBe(3);
  });

  it("NEVER runs two syncs concurrently — sequential/queued, not Promise.all (rate-limit safety)", async () => {
    credentialsTable([
      { user_id: "user-1", marketplace: "trendyol" },
      { user_id: "user-2", marketplace: "trendyol" },
      { user_id: "user-3", marketplace: "trendyol" },
    ]);

    let active = 0;
    let maxActive = 0;
    mockResync.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return { success: true, marketplace: "trendyol", ordersFetched: 1, rowsSaved: 1, duplicatesSkipped: 0 };
    });

    const { GET } = await importRoute();
    await GET(makeRequest("Bearer test-cron-secret"));

    expect(mockResync).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(1); // proof: never more than one resync in flight at once
  });

  it("one connection throwing unexpectedly does not abort the rest of the queue", async () => {
    credentialsTable([
      { user_id: "user-1", marketplace: "trendyol" },
      { user_id: "user-2", marketplace: "hepsiburada" },
      { user_id: "user-3", marketplace: "n11" },
    ]);
    mockResync
      .mockResolvedValueOnce({ success: true, marketplace: "trendyol", ordersFetched: 1, rowsSaved: 1, duplicatesSkipped: 0 })
      .mockRejectedValueOnce(new Error("network exploded"))
      .mockResolvedValueOnce({ success: true, marketplace: "n11", ordersFetched: 1, rowsSaved: 1, duplicatesSkipped: 0 });

    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockResync).toHaveBeenCalledTimes(3); // the throw on #2 didn't stop #3
    expect(json.checked).toBe(3);
    expect(json.succeeded).toBe(2);
  });

  it("skips non-resyncable marketplace rows without ever calling resyncMarketplace for them", async () => {
    credentialsTable([
      { user_id: "user-1", marketplace: "trendyol" },
      { user_id: "user-2", marketplace: "ebay" }, // not a real-integration marketplace — should never be attempted
    ]);
    mockResync.mockResolvedValue({ success: true, marketplace: "trendyol", ordersFetched: 0, rowsSaved: 0, duplicatesSkipped: 0 });

    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer test-cron-secret"));
    const json = await res.json();

    expect(mockResync).toHaveBeenCalledTimes(1);
    expect(mockResync).toHaveBeenCalledWith(expect.anything(), "user-1", "trendyol");
    expect(json.checked).toBe(1);
  });

  it("with zero stored connections, succeeds trivially without calling resyncMarketplace", async () => {
    credentialsTable([]);
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.checked).toBe(0);
    expect(mockResync).not.toHaveBeenCalled();
  });
});
