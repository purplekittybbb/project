import { afterEach, describe, expect, it } from "vitest";
import {
  DEFERRED_PAID_INFRA,
  FREE_TIER_CRON_PATHS,
  FREE_TIER_MAX_SCRAPE_SLOTS,
} from "@/lib/infra/free-tier";
import { maxConcurrentScrapes } from "@/lib/supabase/scan-concurrency";
import vercelJson from "@/vercel.json";

describe("free-tier guardrails", () => {
  const originalScrapeMax = process.env.SCRAPE_MAX_CONCURRENT;

  afterEach(() => {
    if (originalScrapeMax === undefined) delete process.env.SCRAPE_MAX_CONCURRENT;
    else process.env.SCRAPE_MAX_CONCURRENT = originalScrapeMax;
  });

  it("defaults scrape concurrency to the free-tier cap", () => {
    delete process.env.SCRAPE_MAX_CONCURRENT;
    expect(FREE_TIER_MAX_SCRAPE_SLOTS).toBe(2);
    expect(maxConcurrentScrapes()).toBe(FREE_TIER_MAX_SCRAPE_SLOTS);
  });

  it("allows SCRAPE_MAX_CONCURRENT override", () => {
    process.env.SCRAPE_MAX_CONCURRENT = "5";
    expect(maxConcurrentScrapes()).toBe(5);
  });

  it("keeps vercel.json crons within the free-tier allowlist (no paid workers)", () => {
    const paths = (vercelJson.crons ?? []).map((c) => c.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(FREE_TIER_CRON_PATHS).toContain(path);
    }
  });

  it("documents deferred paid infra names", () => {
    expect(DEFERRED_PAID_INFRA.join(" ")).toMatch(/Fargate/i);
    expect(DEFERRED_PAID_INFRA.join(" ")).toMatch(/CapSolver/i);
    // Redis/BullMQ is optional via REDIS_URL — no longer listed as hard-deferred.
    expect(DEFERRED_PAID_INFRA.join(" ")).not.toMatch(/Redis/i);
  });
});

describe("Next.js 16 proxy convention", () => {
  it("uses proxy.ts instead of deprecated middleware.ts", async () => {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const root = resolve(__dirname, "../..");
    expect(existsSync(resolve(root, "proxy.ts"))).toBe(true);
    expect(existsSync(resolve(root, "middleware.ts"))).toBe(false);
  });
});
