import { describe, expect, it } from "vitest";
import {
  exponentialBackoffMs,
  SCRAPE_BACKOFF_BASE_MS,
  SCRAPE_JOB_ATTEMPTS,
  SCRAPE_JOB_BACKOFF,
} from "@/lib/queues/backoff";
import { enqueueScrapeJob, __resetScrapeQueueForTests, isRedisConfigured, isFinalAttempt } from "@/lib/queue";
import { isUsableStandaloneResult } from "@/lib/tools/usable-result";

describe("BullMQ exponential backoff (2s → 4s → 8s)", () => {
  it("matches the required delay sequence", () => {
    expect(exponentialBackoffMs(1)).toBe(2_000);
    expect(exponentialBackoffMs(2)).toBe(4_000);
    expect(exponentialBackoffMs(3)).toBe(8_000);
    expect(exponentialBackoffMs(4)).toBe(16_000);
  });

  it("caps runaway attempts", () => {
    expect(exponentialBackoffMs(20)).toBe(60_000);
  });

  it("exports BullMQ-compatible backoff settings (4 attempts → 2s/4s/8s retries)", () => {
    expect(SCRAPE_JOB_BACKOFF).toEqual({ type: "exponential", delay: SCRAPE_BACKOFF_BASE_MS });
    expect(SCRAPE_JOB_ATTEMPTS).toBe(4);
  });
});

describe("Dead Letter Pattern — final attempt detection", () => {
  it("isFinalAttempt is false while retries remain", () => {
    expect(isFinalAttempt({ attemptsMade: 1, opts: { attempts: 4 } })).toBe(false);
    expect(isFinalAttempt({ attemptsMade: 3, opts: { attempts: 4 } })).toBe(false);
  });

  it("isFinalAttempt is true when attemptsMade reaches max", () => {
    expect(isFinalAttempt({ attemptsMade: 4, opts: { attempts: 4 } })).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 5, opts: { attempts: 4 } })).toBe(true);
  });
});

describe("enqueueScrapeJob without Redis (stress / fail-closed)", () => {
  it("does not throw when REDIS_URL is absent — returns redis_unavailable", async () => {
    __resetScrapeQueueForTests();
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_URL;
    expect(isRedisConfigured()).toBe(false);
    const res = await enqueueScrapeJob({
      toolId: "price-track",
      marketplace: "trendyol",
      keyword: "kulaklık",
      reason: "rate_limit_429",
    });
    expect(res.queued).toBe(false);
    if (!res.queued) expect(res.reason).toBe("redis_unavailable");
  });
});

describe("rate-limit → no fake success envelope", () => {
  it("queued mode is never treated as usable (no ₺0 success)", () => {
    expect(
      isUsableStandaloneResult("price-track", {
        mode: "queued",
        data: { prices: [], stats: { min: 0, max: 0, median: 0, p25: 0, p75: 0 }, retryAfterSeconds: 8 },
      }),
    ).toBe(false);
  });

  it("zero-price live payload is unusable", () => {
    expect(
      isUsableStandaloneResult("price-track", {
        mode: "live",
        data: { prices: [{ title: "x", price: 0, currency: "TRY", rank: 1 }] },
      }),
    ).toBe(false);
  });
});
