import { describe, expect, it } from "vitest";
import {
  buildRateLimitSubject,
  checkAndIncrementToolUsage,
  hashIp,
} from "../../lib/tools/guest-rate-limit";
import { GUEST_DAILY_LIMIT, AUTH_NO_STORE_DAILY_LIMIT } from "../../lib/tools/limits";

function mockHeaders(ip = "203.0.113.10"): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

describe("guest rate limit", () => {
  it("hashes IP consistently", () => {
    expect(hashIp("1.2.3.4")).toHaveLength(32);
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });

  it("uses IP subject for anonymous users", () => {
    const subject = buildRateLimitSubject(mockHeaders(), null);
    expect(subject.type).toBe("ip");
    expect(subject.key).toBe(hashIp("203.0.113.10"));
  });

  it("uses user subject when signed in", () => {
    const subject = buildRateLimitSubject(mockHeaders(), "user-abc");
    expect(subject.type).toBe("user");
    expect(subject.key).toBe("user-abc");
  });

  it("blocks after daily guest limit", async () => {
    const store = new Map<string, number>();
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { usage_count: GUEST_DAILY_LIMIT },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
      }),
    };

    const result = await checkAndIncrementToolUsage(
      "visibility",
      { type: "ip", key: "test-ip" },
      mockClient as never,
    );

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(GUEST_DAILY_LIMIT);
    expect(store.size).toBe(0);
  });

  it("increments usage for authenticated users with higher limit", async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { usage_count: 3 }, error: null }),
                }),
              }),
            }),
          }),
        }),
        upsert: async (payload: Record<string, unknown>) => {
          upsertPayload = payload;
          return { error: null };
        },
      }),
    };

    const result = await checkAndIncrementToolUsage(
      "price-track",
      { type: "user", key: "user-1" },
      mockClient as never,
    );

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(AUTH_NO_STORE_DAILY_LIMIT);
    expect((upsertPayload as { usage_count: number } | null)?.usage_count).toBe(4);
  });

  it("fails open when supabase client is null", async () => {
    const result = await checkAndIncrementToolUsage(
      "index-check",
      { type: "ip", key: "x" },
      null,
    );
    expect(result.allowed).toBe(true);
    expect(result.enforced).toBe(false);
  });
});
