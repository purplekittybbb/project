import { describe, expect, it } from "vitest";
import { isUsableStandaloneResult } from "@/lib/tools/usable-result";

describe("isUsableStandaloneResult", () => {
  it("treats cached and stale as usable", () => {
    expect(isUsableStandaloneResult("price-track", { mode: "cached", data: { prices: [] } })).toBe(true);
    expect(isUsableStandaloneResult("top100", { mode: "stale", data: { items: [] } })).toBe(true);
  });

  it("rejects queued and preview", () => {
    expect(isUsableStandaloneResult("price-track", { mode: "queued", data: {} })).toBe(false);
    expect(isUsableStandaloneResult("price-track", { mode: "preview", data: {} })).toBe(false);
  });

  it("requires positive prices for price-track live results", () => {
    expect(
      isUsableStandaloneResult("price-track", {
        mode: "live",
        data: { prices: [{ price: 0 }, { price: 0 }] },
      }),
    ).toBe(false);
    expect(
      isUsableStandaloneResult("price-track", {
        mode: "live",
        data: { prices: [{ price: 199 }] },
      }),
    ).toBe(true);
  });

  it("rejects live results with error field", () => {
    expect(
      isUsableStandaloneResult("price-track", {
        mode: "live",
        data: { prices: [{ price: 10 }], error: "blocked" },
      }),
    ).toBe(false);
  });

  it("requires positive-priced items for top100", () => {
    expect(
      isUsableStandaloneResult("top100", {
        mode: "live",
        data: { items: [{ price: 0 }], priceStats: { min: 0, p50: 0, max: 0 } },
      }),
    ).toBe(false);
    expect(
      isUsableStandaloneResult("top100", {
        mode: "live",
        data: { items: [{ price: 50 }] },
      }),
    ).toBe(true);
  });
});
