import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelectChain = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "decision_ledger") {
        return { select: () => ({ eq: () => ({ order: () => mockSelectChain() }) }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

async function importRoute() {
  return import("../app/api/ledger/list/route");
}

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/ledger/list", { headers });
}

describe("GET /api/ledger/list", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockSelectChain.mockReset();
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" };
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns an empty list with no Authorization header — never touches the database", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entries).toEqual([]);
    expect(mockSelectChain).not.toHaveBeenCalled();
  });

  it("returns an empty list when the session is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    mockSelectChain.mockResolvedValue({ data: [], error: null });
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer bad-token"));
    const json = await res.json();
    expect(json.entries).toEqual([]);
  });

  it("maps stored rows oldest-first into a display-ready, 1-indexed seq", async () => {
    mockSelectChain.mockResolvedValue({
      data: [
        { id: "a", approved_limit: 1000, take_rate: 0.03, currency: "TRY", model_version: "truemargin-underwriting/0.1.0", recorded_at: "2024-01-01T00:00:00.000Z" },
        { id: "b", approved_limit: 1200, take_rate: 0.035, currency: "TRY", model_version: "truemargin-underwriting/0.1.0", recorded_at: "2024-02-01T00:00:00.000Z" },
      ],
      error: null,
    });
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer token"));
    const json = await res.json();

    expect(json.entries).toHaveLength(2);
    expect(json.entries[0]).toMatchObject({ seq: 1, approvedLimit: 1000, takeRate: 0.03, currency: "TRY" });
    expect(json.entries[1]).toMatchObject({ seq: 2, approvedLimit: 1200 });
  });

  it("returns an empty list (not a crash) on a query error", async () => {
    mockSelectChain.mockResolvedValue({ data: null, error: new Error("boom") });
    const { GET } = await importRoute();
    const res = await GET(makeRequest("Bearer token"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entries).toEqual([]);
  });
});
