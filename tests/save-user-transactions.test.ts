import { describe, expect, it } from "vitest";
import { saveDedupedTransactions } from "../lib/save-user-transactions";
import type { UserRawRow } from "../lib/adapters/csv";

function row(orderId: string): UserRawRow {
  return {
    order_id: orderId,
    sku: "SKU-1",
    category: "Elektronik",
    sale_date: "2026-05-10",
    units: 1,
    gross_revenue: 100,
    unit_cost: 40,
    shipping: 5,
    return_rate: 0.05,
    ad_spend: 0,
    marketplace: "trendyol",
  };
}

function makeClient(opts: {
  existing?: string[];
  upsertError?: { message: string; code?: string } | null;
  insertError?: { message: string; code?: string } | null;
  onUpsert?: (payload: unknown) => void;
  onInsert?: (payload: unknown) => void;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({
            data: (opts.existing ?? []).map((order_id) => ({ order_id })),
            error: null,
          }),
        }),
      }),
      upsert: async (payload: unknown) => {
        opts.onUpsert?.(payload);
        return { error: opts.upsertError ?? null };
      },
      insert: async (payload: unknown) => {
        opts.onInsert?.(payload);
        return { error: opts.insertError ?? null };
      },
    }),
  };
}

describe("saveDedupedTransactions", () => {
  it("skips order_ids already stored for that user+marketplace", async () => {
    let upserted: unknown[] = [];
    const client = makeClient({
      existing: ["ORD-1"],
      onUpsert: (p) => {
        upserted = p as unknown[];
      },
    });
    const result = await saveDedupedTransactions(
      client as never,
      "user-1",
      "trendyol",
      [row("ORD-1"), row("ORD-2")],
    );
    expect(result.error).toBeNull();
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.rowsSaved).toBe(1);
    expect(upserted).toHaveLength(1);
    expect((upserted[0] as { order_id: string }).order_id).toBe("ORD-2");
  });

  it("upserts when the 0003 unique index is present", async () => {
    let upserted: unknown[] = [];
    const client = makeClient({
      existing: [],
      onUpsert: (p) => {
        upserted = p as unknown[];
      },
    });
    const result = await saveDedupedTransactions(
      client as never,
      "user-1",
      "trendyol",
      [row("ORD-9")],
    );
    expect(result.error).toBeNull();
    expect(result.rowsSaved).toBe(1);
    expect(upserted).toHaveLength(1);
  });

  it("falls back to insert when ON CONFLICT target is missing", async () => {
    let inserted: unknown[] = [];
    const client = makeClient({
      existing: [],
      upsertError: {
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      },
      onInsert: (p) => {
        inserted = p as unknown[];
      },
    });
    const result = await saveDedupedTransactions(
      client as never,
      "user-1",
      "trendyol",
      [row("ORD-9")],
    );
    expect(result.error).toBeNull();
    expect(result.rowsSaved).toBe(1);
    expect(inserted).toHaveLength(1);
  });

  it("treats a unique-violation insert as skipped, not a hard failure", async () => {
    const client = makeClient({
      existing: [],
      upsertError: {
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      },
      insertError: { code: "23505", message: "duplicate key value" },
    });
    const result = await saveDedupedTransactions(
      client as never,
      "user-1",
      "trendyol",
      [row("ORD-9")],
    );
    expect(result.error).toBeNull();
    expect(result.rowsSaved).toBe(0);
  });
});
