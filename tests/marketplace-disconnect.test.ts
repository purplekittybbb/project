import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// POST /api/marketplace/disconnect creates its own user-scoped Supabase client
// via createClient(url, anonKey, { headers: Authorization }) — mock the module
// so this test never needs a real Supabase project.
const mockGetUser = vi.fn();
const mockCredDelete = vi.fn();
const mockDataDelete = vi.fn();

function credentialsBuilder() {
  return { eq: () => ({ eq: () => mockCredDelete() }) };
}
function transactionsBuilder() {
  return { eq: () => ({ eq: () => ({ select: () => mockDataDelete() }) }) };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "marketplace_credentials") return { delete: () => credentialsBuilder() };
      if (table === "user_transactions") return { delete: () => transactionsBuilder() };
      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

async function importRoute() {
  return import("../app/api/marketplace/disconnect/route");
}

function makeRequest(body: unknown, authHeader?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/marketplace/disconnect", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/marketplace/disconnect", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockCredDelete.mockReset();
    mockDataDelete.mockReset();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockCredDelete.mockResolvedValue({ error: null });
    mockDataDelete.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects a request with no Authorization header", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "trendyol" }));
    expect(res.status).toBe(401);
    expect(mockCredDelete).not.toHaveBeenCalled();
  });

  it("rejects a request missing marketplace", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({}, "Bearer token"));
    expect(res.status).toBe(400);
  });

  it("rejects when the session is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "trendyol" }, "Bearer bad-token"));
    expect(res.status).toBe(401);
    expect(mockCredDelete).not.toHaveBeenCalled();
  });

  it("deletes the stored credential but leaves user_transactions untouched when deleteData is omitted", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "trendyol" }, "Bearer token"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.deletedData).toBe(false);
    expect(mockCredDelete).toHaveBeenCalledTimes(1);
    expect(mockDataDelete).not.toHaveBeenCalled();
  });

  it("deletes both the credential AND this marketplace's rows when deleteData is true", async () => {
    mockDataDelete.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null });
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "trendyol", deleteData: true }, "Bearer token"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.deletedData).toBe(true);
    expect(json.rowsDeleted).toBe(3);
    expect(mockCredDelete).toHaveBeenCalledTimes(1);
    expect(mockDataDelete).toHaveBeenCalledTimes(1);
  });

  it("works for demo-only marketplaces with no credential row (delete is a no-op, not an error)", async () => {
    mockCredDelete.mockResolvedValue({ error: null }); // RLS delete matching 0 rows is not an error
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "ebay", deleteData: true }, "Bearer token"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 502 (not a crash) if the credential delete fails", async () => {
    mockCredDelete.mockResolvedValue({ error: new Error("boom") });
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "trendyol" }, "Bearer token"));
    expect(res.status).toBe(502);
  });

  it("returns 502 (not a crash) if the data delete fails, after credentials were already removed", async () => {
    mockDataDelete.mockResolvedValue({ data: null, error: new Error("boom") });
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ marketplace: "trendyol", deleteData: true }, "Bearer token"));
    expect(res.status).toBe(502);
    expect(mockCredDelete).toHaveBeenCalledTimes(1);
  });
});
