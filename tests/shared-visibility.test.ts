import { describe, expect, it, vi } from "vitest";
import {
  normalizeSharedSku,
  sharedScanKey,
  upsertSharedVisibilityScan,
  loadSharedVisibilityScan,
  loadLatestSharedScan,
  loadSharedLastScans,
  loadWatchedVisibility,
  ensureVisibilityWatch,
  loadVisibilityWatches,
} from "@/lib/supabase/shared-visibility";
import { insertVisibilityCheck, resolveLatestVisibility } from "@/lib/supabase/visibility-checks";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("normalizeSharedSku", () => {
  it("maps null/undefined/blank to empty string (SQL unique-key sentinel)", () => {
    expect(normalizeSharedSku(null)).toBe("");
    expect(normalizeSharedSku(undefined)).toBe("");
    expect(normalizeSharedSku("  ")).toBe("");
    expect(normalizeSharedSku("SKU-1")).toBe("SKU-1");
  });
});

function chain(resolved: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {};
  const ret = () => self;
  self.from = ret;
  self.select = ret;
  self.eq = ret;
  self.in = ret;
  self.order = ret;
  self.limit = ret;
  self.maybeSingle = vi.fn().mockResolvedValue(resolved);
  self.single = vi.fn().mockResolvedValue(resolved);
  self.upsert = vi.fn().mockReturnValue(self);
  self.insert = vi.fn().mockResolvedValue(resolved);
  self.then = (ok: (v: unknown) => unknown) => Promise.resolve(resolved).then(ok);
  return self as unknown as SupabaseClient & { insert: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };
}

describe("upsertSharedVisibilityScan", () => {
  it("upserts on marketplace,keyword,sku and returns the id", async () => {
    const client = chain({ data: { id: "scan-1" }, error: null });
    const { scanId, error } = await upsertSharedVisibilityScan(client, {
      marketplace: "trendyol",
      keyword: "kulaklık",
      sku: "SKU-A",
      rank: 3,
      page: 1,
      isIndexed: true,
      isOnFirstPage: true,
    });
    expect(error).toBeNull();
    expect(scanId).toBe("scan-1");
  });

  it("soft-fails when the table is missing", async () => {
    const client = chain({ data: null, error: { message: "relation does not exist" } });
    const { scanId, error } = await upsertSharedVisibilityScan(client, {
      marketplace: "trendyol",
      keyword: "x",
      rank: null,
      page: null,
      isIndexed: false,
      isOnFirstPage: false,
    });
    expect(scanId).toBeNull();
    expect(error).toContain("relation does not exist");
  });
});

describe("ensureVisibilityWatch / loadVisibilityWatches", () => {
  it("upserts a private watch and does not throw on conflict", async () => {
    const client = chain({ data: [{}], error: null });
    const { error } = await ensureVisibilityWatch(client, "user-1", {
      tenantId: "user-1",
      marketplace: "trendyol",
      sku: "SKU-A",
      keyword: "kulaklık",
    });
    expect(error).toBeNull();
  });

  it("loadVisibilityWatches returns [] on error", async () => {
    const client = chain({ data: null, error: { message: "boom" } });
    expect(await loadVisibilityWatches(client, "user-1")).toEqual([]);
  });
});

describe("loadSharedVisibilityScan", () => {
  it("maps a stored shared row", async () => {
    const client = chain({
      data: {
        id: "s1",
        marketplace: "trendyol",
        keyword: "kulaklık",
        sku: "SKU-A",
        rank: 4,
        page: 1,
        is_indexed: true,
        is_on_first_page: true,
        search_result_count: 36,
        scraped_at: "2026-09-11T00:00:00.000Z",
      },
      error: null,
    });
    const row = await loadSharedVisibilityScan(client, "trendyol", "kulaklık", "SKU-A");
    expect(row?.rank).toBe(4);
    expect(row?.isOnFirstPage).toBe(true);
  });
});

describe("insertVisibilityCheck — shared_scan_id back-compat", () => {
  it("retries without shared_scan_id when the column is missing", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "column shared_scan_id does not exist" } })
      .mockResolvedValueOnce({ error: null });
    const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;

    const { error } = await insertVisibilityCheck(client, "user-1", {
      tenantId: "user-1",
      marketplace: "trendyol",
      sku: "SKU-A",
      keyword: "kulaklık",
      rank: 1,
      page: 1,
      isIndexed: true,
      isOnFirstPage: true,
      sharedScanId: "scan-1",
    });
    expect(error).toBeNull();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0]).toHaveProperty("shared_scan_id", "scan-1");
    expect(insert.mock.calls[1][0]).not.toHaveProperty("shared_scan_id");
  });
});

describe("sharedScanKey / loadWatchedVisibility / loadSharedLastScans", () => {
  it("sharedScanKey normalizes sku the same way as the SQL sentinel", () => {
    expect(sharedScanKey("trendyol", "kulaklık", " SKU-A ")).toBe(
      sharedScanKey("trendyol", "kulaklık", "SKU-A"),
    );
    expect(sharedScanKey("trendyol", "k", null)).toBe(sharedScanKey("trendyol", "k", ""));
  });

  it("loadWatchedVisibility joins private watches to shared scans by key", async () => {
    const watches = [
      {
        id: "w1",
        tenant_id: "user-1",
        marketplace: "trendyol",
        sku: "SKU-A",
        keyword: "kulaklık",
        created_at: "2026-09-11T00:00:00.000Z",
      },
    ];
    const scans = [
      {
        id: "s1",
        marketplace: "trendyol",
        keyword: "kulaklık",
        sku: "SKU-A",
        rank: 4,
        page: 1,
        is_indexed: true,
        is_on_first_page: true,
        search_result_count: 36,
        scraped_at: "2026-09-11T12:00:00.000Z",
      },
    ];

    const client = {
      from: vi.fn((table: string) => {
        if (table === "visibility_watches") {
          return chain({ data: watches, error: null });
        }
        return chain({ data: scans, error: null });
      }),
    } as unknown as SupabaseClient;

    const rows = await loadWatchedVisibility(client, "user-1", { marketplace: "trendyol" });
    expect(rows).toHaveLength(1);
    expect(rows[0].watch.sku).toBe("SKU-A");
    expect(rows[0].scan?.rank).toBe(4);
    expect(rows[0].scan?.id).toBe("s1");
  });

  it("loadWatchedVisibility leaves scan null when the shared table is missing", async () => {
    const watches = [
      {
        id: "w1",
        tenant_id: "user-1",
        marketplace: "trendyol",
        sku: "SKU-A",
        keyword: "kulaklık",
        created_at: "2026-09-11T00:00:00.000Z",
      },
    ];
    const client = {
      from: vi.fn((table: string) => {
        if (table === "visibility_watches") {
          return chain({ data: watches, error: null });
        }
        return chain({ data: null, error: { message: "relation does not exist" } });
      }),
    } as unknown as SupabaseClient;

    const rows = await loadWatchedVisibility(client, "user-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].scan).toBeNull();
  });

  it("loadSharedLastScans prefers shared scraped_at and falls back to personal history", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "shared_visibility_scans") {
          return chain({
            data: [{ sku: "SKU-A", scraped_at: "2026-09-11T12:00:00.000Z" }],
            error: null,
          });
        }
        return chain({
          data: [{ sku: "SKU-B", checked_at: "2026-09-01T00:00:00.000Z" }],
          error: null,
        });
      }),
    } as unknown as SupabaseClient;

    const last = await loadSharedLastScans(client, {
      marketplace: "trendyol",
      skus: ["SKU-A", "SKU-B"],
      userId: "user-1",
    });
    expect(last.get("SKU-A")).toBe("2026-09-11T12:00:00.000Z");
    expect(last.get("SKU-B")).toBe("2026-09-01T00:00:00.000Z");
  });

  it("loadSharedLastScans returns an empty map for an empty sku list", async () => {
    const from = vi.fn();
    const last = await loadSharedLastScans({ from } as unknown as SupabaseClient, {
      marketplace: "trendyol",
      skus: [],
    });
    expect(last.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("loadLatestSharedScan maps the newest shared row", async () => {
    const client = chain({
      data: {
        id: "s1",
        marketplace: "trendyol",
        keyword: "kulaklık",
        sku: "SKU-A",
        rank: 2,
        page: 1,
        is_indexed: true,
        is_on_first_page: true,
        scraped_at: "2026-09-11T12:00:00.000Z",
      },
      error: null,
    });
    const row = await loadLatestSharedScan(client, "SKU-A", "trendyol");
    expect(row?.rank).toBe(2);
    expect(row?.id).toBe("s1");
  });

  it("resolveLatestVisibility prefers the shared scan over personal history", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "shared_visibility_scans") {
          return chain({
            data: {
              id: "s1",
              marketplace: "trendyol",
              keyword: "kulaklık",
              sku: "SKU-A",
              rank: 7,
              page: 1,
              is_indexed: true,
              is_on_first_page: true,
              scraped_at: "2026-09-11T12:00:00.000Z",
            },
            error: null,
          });
        }
        return chain({
          data: {
            id: "old",
            user_id: "user-1",
            tenant_id: "user-1",
            marketplace: "trendyol",
            sku: "SKU-A",
            keyword: "SKU-A",
            rank: 99,
            page: 3,
            is_indexed: true,
            is_on_first_page: false,
            checked_at: "2026-08-01T00:00:00.000Z",
          },
          error: null,
        });
      }),
    } as unknown as SupabaseClient;

    const latest = await resolveLatestVisibility(client, "SKU-A", "trendyol");
    expect(latest?.rank).toBe(7);
    expect(latest?.sharedScanId).toBe("s1");
    expect(latest?.checkedAt).toBe("2026-09-11T12:00:00.000Z");
    expect(client.from).toHaveBeenCalledWith("shared_visibility_scans");
    expect(client.from).not.toHaveBeenCalledWith("visibility_checks");
  });

  it("resolveLatestVisibility falls back to personal history when shared is empty", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "shared_visibility_scans") {
          return chain({ data: null, error: null });
        }
        return chain({
          data: {
            id: "old",
            user_id: "user-1",
            tenant_id: "user-1",
            marketplace: "trendyol",
            sku: "SKU-A",
            keyword: "SKU-A",
            rank: 11,
            page: 1,
            is_indexed: true,
            is_on_first_page: true,
            checked_at: "2026-08-01T00:00:00.000Z",
          },
          error: null,
        });
      }),
    } as unknown as SupabaseClient;

    const latest = await resolveLatestVisibility(client, "SKU-A", "trendyol");
    expect(latest?.rank).toBe(11);
    expect(latest?.id).toBe("old");
  });
});
