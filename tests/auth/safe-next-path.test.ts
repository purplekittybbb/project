import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("safeNextPath", () => {
  it("returns fallback for null/empty", () => {
    expect(safeNextPath(null)).toBe("/connect");
    expect(safeNextPath("", "/dashboard")).toBe("/dashboard");
  });

  it("allows relative same-origin paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/araclar/gorunurluk")).toBe("/araclar/gorunurluk");
    expect(safeNextPath("/connect?preview=connect", "/dashboard")).toBe(
      "/connect?preview=connect",
    );
  });

  it("blocks open redirects", () => {
    expect(safeNextPath("//evil.com")).toBe("/connect");
    expect(safeNextPath("https://evil.com")).toBe("/connect");
    expect(safeNextPath("/\\evil")).toBe("/connect");
  });
});
