import { describe, expect, it } from "vitest";
import { istanbulDayString } from "../../lib/time/istanbul";

describe("istanbulDayString", () => {
  it("keeps a mid-day UTC instant on the same calendar day", () => {
    expect(istanbulDayString("2026-05-10T12:00:00.000Z")).toBe("2026-05-10");
  });

  it("does not drop 00:00–02:59 Istanbul orders onto the previous UTC day", () => {
    // 2026-05-10 00:30 +03 = 2026-05-09 21:30 UTC
    expect(istanbulDayString("2026-05-09T21:30:00.000Z")).toBe("2026-05-10");
    expect(istanbulDayString("2026-05-09T23:59:00.000Z")).toBe("2026-05-10");
  });

  it("rolls to the next Istanbul day at 21:00 UTC (00:00 +03)", () => {
    expect(istanbulDayString("2026-05-10T20:59:00.000Z")).toBe("2026-05-10");
    expect(istanbulDayString("2026-05-10T21:00:00.000Z")).toBe("2026-05-11");
  });

  it("returns empty string for invalid input", () => {
    expect(istanbulDayString("not-a-date")).toBe("");
  });
});
