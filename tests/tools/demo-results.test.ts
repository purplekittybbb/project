import { describe, expect, it } from "vitest";
import { buildPreviewResult } from "../../lib/tools/demo-results";

describe("demo preview results", () => {
  const input = {
    type: "keyword" as const,
    marketplace: "trendyol" as const,
    keyword: "kulaklık",
    targetTitle: "kulaklık",
  };

  it("returns preview mode for each standalone tool", () => {
    for (const toolId of ["visibility", "index-check", "price-track", "top100"] as const) {
      const r = buildPreviewResult(toolId, input) as { mode?: string };
      expect(r.mode).toBe("preview");
    }
  });
});
