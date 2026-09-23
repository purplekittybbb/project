import { describe, expect, it } from "vitest";
import { buildScanQueue, type QueueInput } from "../../lib/demand/queue";
import type { SkuMargin } from "../../lib/domain/margin-engine";

function makeSku(overrides: Partial<SkuMargin> = {}): SkuMargin {
  return {
    sku: "SKU-A",
    category: "Elektronik",
    perceivedMarginPct: 10,
    trueMarginPct: 5,
    gapPct: 5,
    isSilentLoser: false,
    returnRatePct: 2,
    isReturnRisk: false,
    netContribution: 0,
    ...overrides,
  };
}

const REF_TIME = new Date("2026-01-15T12:00:00Z");

describe("buildScanQueue", () => {
  it("returns empty array for empty skus", () => {
    const input: QueueInput = {
      skus: [],
      marketplace: "trendyol",
      lastScans: new Map(),
      referenceTime: REF_TIME,
    };
    expect(buildScanQueue(input)).toEqual([]);
  });

  it("assigns +40 pts to a loss sku (trueMarginPct < 0)", () => {
    const skus: SkuMargin[] = [
      makeSku({ sku: "LOSS", trueMarginPct: -5 }),
      makeSku({ sku: "NORMAL", trueMarginPct: 20 }),
    ];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(), // never scanned → both get +20
      referenceTime: REF_TIME,
    });
    // LOSS: 40 + 20 = 60, NORMAL: 0 + 20 = 20
    expect(queue[0].sku).toBe("LOSS");
    expect(queue[0].priorityScore).toBe(60);
    expect(queue[1].sku).toBe("NORMAL");
    expect(queue[1].priorityScore).toBe(20);
  });

  it("assigns +30 pts to a silent loser", () => {
    const skus: SkuMargin[] = [
      makeSku({ sku: "SILENT", isSilentLoser: true, perceivedMarginPct: 10, trueMarginPct: -2 }),
    ];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(),
      referenceTime: REF_TIME,
    });
    // silent loser: +30, loss: +40, never scanned: +20 → 90
    expect(queue[0].priorityScore).toBe(90);
  });

  it("assigns +20 pts to never-scanned sku", () => {
    const skus = [makeSku({ sku: "NEW", trueMarginPct: 10 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(), // missing → never scanned
      referenceTime: REF_TIME,
    });
    expect(queue[0].priorityScore).toBe(20);
    expect(queue[0].reason.some((r) => r.includes("Hiç taranmamış"))).toBe(true);
  });

  it("assigns +10 pts for >7 days since last scan", () => {
    const lastScanTs = new Date("2026-01-05T12:00:00Z").toISOString(); // 10 days ago
    const skus = [makeSku({ sku: "OLD7", trueMarginPct: 10 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map([["OLD7", lastScanTs]]),
      referenceTime: REF_TIME,
    });
    expect(queue[0].priorityScore).toBe(10);
  });

  it("assigns +30 pts total for >14 days since last scan (10+20)", () => {
    const lastScanTs = new Date("2025-12-28T12:00:00Z").toISOString(); // 18 days ago
    const skus = [makeSku({ sku: "OLD14", trueMarginPct: 10 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map([["OLD14", lastScanTs]]),
      referenceTime: REF_TIME,
    });
    expect(queue[0].priorityScore).toBe(30);
  });

  it("assigns +15 pts for thin margin (0-5%)", () => {
    const skus = [makeSku({ sku: "THIN", trueMarginPct: 3 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(), // never scanned: +20
      referenceTime: REF_TIME,
    });
    // thin: 15 + never scanned: 20 = 35
    expect(queue[0].priorityScore).toBe(35);
  });

  it("boundary: trueMarginPct = 0 → thin margin (+15)", () => {
    const skus = [makeSku({ sku: "ZERO", trueMarginPct: 0 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map([["ZERO", new Date("2026-01-14T12:00:00Z").toISOString()]]),
      referenceTime: REF_TIME, // 1 day ago, no >7 days bonus
    });
    expect(queue[0].priorityScore).toBe(15);
  });

  it("boundary: trueMarginPct = 5 → thin margin (+15)", () => {
    const skus = [makeSku({ sku: "THIN5", trueMarginPct: 5 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map([["THIN5", REF_TIME.toISOString()]]),
      referenceTime: REF_TIME,
    });
    expect(queue[0].priorityScore).toBe(15);
  });

  it("boundary: trueMarginPct > 5 → no thin margin bonus", () => {
    const skus = [makeSku({ sku: "OK", trueMarginPct: 6 })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map([["OK", REF_TIME.toISOString()]]),
      referenceTime: REF_TIME,
    });
    expect(queue[0].priorityScore).toBe(0);
  });

  it("schedules first job 1 min after referenceTime", () => {
    const skus = [makeSku({ sku: "A" })];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(),
      referenceTime: REF_TIME,
    });
    const expectedFirst = new Date(REF_TIME.getTime() + 60_000);
    expect(queue[0].scheduledAt.getTime()).toBe(expectedFirst.getTime());
  });

  it("spreads jobs 5 minutes apart", () => {
    const skus = [
      makeSku({ sku: "A" }),
      makeSku({ sku: "B" }),
      makeSku({ sku: "C" }),
    ];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(),
      referenceTime: REF_TIME,
    });
    const delta1 = queue[1].scheduledAt.getTime() - queue[0].scheduledAt.getTime();
    const delta2 = queue[2].scheduledAt.getTime() - queue[1].scheduledAt.getTime();
    expect(delta1).toBe(5 * 60_000);
    expect(delta2).toBe(5 * 60_000);
  });

  it("sorts by score descending, alphabetically by sku on ties", () => {
    const skus: SkuMargin[] = [
      makeSku({ sku: "Z-SKU", trueMarginPct: 10 }),
      makeSku({ sku: "A-SKU", trueMarginPct: 10 }),
    ];
    const queue = buildScanQueue({
      skus,
      marketplace: "trendyol",
      lastScans: new Map(),
      referenceTime: REF_TIME,
    });
    // Equal score → alphabetical
    expect(queue[0].sku).toBe("A-SKU");
    expect(queue[1].sku).toBe("Z-SKU");
  });

  it("includes marketplace in each job", () => {
    const skus = [makeSku({ sku: "A" })];
    const queue = buildScanQueue({
      skus,
      marketplace: "hepsiburada",
      lastScans: new Map(),
      referenceTime: REF_TIME,
    });
    expect(queue[0].marketplace).toBe("hepsiburada");
  });
});
