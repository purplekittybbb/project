import { describe, expect, it } from "vitest";
import {
  detectLossAlarms,
  DEFAULT_LOSS_ALARM_THRESHOLDS,
  type LossAlarmLevel,
} from "../../lib/calc/loss-alarm";
import type { SkuMargin } from "../../lib/domain/margin-engine";

function sku(overrides: Partial<SkuMargin> = {}): SkuMargin {
  return {
    sku: "SKU",
    category: "Elektronik",
    perceivedMarginPct: 20,
    trueMarginPct: 15,
    gapPct: 5,
    isSilentLoser: false,
    returnRatePct: 2,
    isReturnRisk: false,
    ...overrides,
  };
}

describe("detectLossAlarms", () => {
  it("flags a silent loser (looks profitable, truly negative)", () => {
    const [alarm] = detectLossAlarms([
      sku({ sku: "A", perceivedMarginPct: 12, trueMarginPct: -4, isSilentLoser: true }),
    ]);
    expect(alarm.level).toBe<LossAlarmLevel>("silent-loss");
    expect(alarm.isSilentLoser).toBe(true);
    expect(alarm.message).toContain("A");
    expect(alarm.message).toContain("kârlı görünüyor");
  });

  it("flags a plain loss (already looks unprofitable)", () => {
    const [alarm] = detectLossAlarms([
      sku({ sku: "B", perceivedMarginPct: -3, trueMarginPct: -10, isSilentLoser: false }),
    ]);
    expect(alarm.level).toBe<LossAlarmLevel>("loss");
    expect(alarm.message).toContain("zarar ediyor");
  });

  it("flags a thin positive margin below the threshold", () => {
    const [alarm] = detectLossAlarms([sku({ sku: "C", trueMarginPct: 3 })]);
    expect(alarm.level).toBe<LossAlarmLevel>("thin-margin");
    expect(alarm.message).toContain("marj çok ince");
  });

  it("flags a healthy-margin SKU with a dangerously high return rate", () => {
    const [alarm] = detectLossAlarms([sku({ sku: "D", trueMarginPct: 20, returnRatePct: 15 })]);
    expect(alarm.level).toBe<LossAlarmLevel>("return-risk");
    expect(alarm.message).toContain("iade oranı yüksek");
  });

  it("omits healthy SKUs entirely", () => {
    expect(detectLossAlarms([sku({ trueMarginPct: 20, returnRatePct: 2 })])).toEqual([]);
  });

  it("ranks most-severe first, then by worst true margin", () => {
    const alarms = detectLossAlarms([
      sku({ sku: "thin", trueMarginPct: 3 }),
      sku({ sku: "return", trueMarginPct: 25, returnRatePct: 20 }),
      sku({ sku: "loss", perceivedMarginPct: -1, trueMarginPct: -20 }),
      sku({ sku: "silent", perceivedMarginPct: 10, trueMarginPct: -5, isSilentLoser: true }),
    ]);
    expect(alarms.map((a) => a.level)).toEqual([
      "silent-loss",
      "loss",
      "thin-margin",
      "return-risk",
    ]);
  });

  it("breaks ties within the same level by worst true margin first", () => {
    const alarms = detectLossAlarms([
      sku({ sku: "mild", perceivedMarginPct: 8, trueMarginPct: -2, isSilentLoser: true }),
      sku({ sku: "severe", perceivedMarginPct: 8, trueMarginPct: -30, isSilentLoser: true }),
    ]);
    // Both are silent-loss; the worse margin (−30) must come first.
    expect(alarms.map((a) => a.sku)).toEqual(["severe", "mild"]);
  });

  it("respects custom thresholds", () => {
    // With a 10% thin threshold, a 7% margin now trips thin-margin;
    // with the default 5% it would be healthy.
    expect(detectLossAlarms([sku({ trueMarginPct: 7 })])).toEqual([]);
    const custom = detectLossAlarms([sku({ trueMarginPct: 7 })], {
      ...DEFAULT_LOSS_ALARM_THRESHOLDS,
      thinMarginPct: 10,
    });
    expect(custom[0].level).toBe<LossAlarmLevel>("thin-margin");
  });
});
