import { describe, expect, it } from "vitest";
import { TESTIMONIALS } from "@/lib/marketing/testimonials";

describe("marketing testimonials honesty", () => {
  it("does not present invented people as real customers", () => {
    const banned = /Elif K\.|Mert A\.|Selin Y\./;
    for (const t of TESTIMONIALS) {
      expect(t.name).not.toMatch(banned);
      expect(t.role.toLowerCase()).toMatch(/temsili/);
    }
  });
});
