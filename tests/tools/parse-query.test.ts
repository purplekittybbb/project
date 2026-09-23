import { describe, expect, it } from "vitest";
import { parseToolQuery, slugToTitle } from "../../lib/tools/parse-query";

describe("parseToolQuery", () => {
  it("treats plain text as keyword on trendyol by default", () => {
    const r = parseToolQuery("bluetooth kulaklık");
    expect(r.type).toBe("keyword");
    expect(r.marketplace).toBe("trendyol");
    expect(r.keyword).toBe("bluetooth kulaklık");
    expect(r.targetTitle).toBe("bluetooth kulaklık");
  });

  it("parses trendyol product URL", () => {
    const r = parseToolQuery(
      "https://www.trendyol.com/siyah-bluetooth-kulaklik-pro-x200-p-123456",
    );
    expect(r.type).toBe("url");
    expect(r.marketplace).toBe("trendyol");
    expect(r.targetTitle.toLowerCase()).toContain("bluetooth");
    expect(r.productUrl).toContain("trendyol.com");
  });

  it("recovers concatenated trendyol URLs into a searchable product name", () => {
    const r = parseToolQuery(
      "https://www.trendyol.com/j-https://www.trendyol.com/j-basket/j-basket-tofu-soya-ezmesi-japonya-300-",
    );
    expect(r.type).toBe("url");
    expect(r.marketplace).toBe("trendyol");
    expect(r.keyword.toLowerCase()).toContain("tofu");
    expect(r.keyword).not.toMatch(/https?:/i);
  });

  it("respects marketplace override", () => {
    const r = parseToolQuery("kulaklık", "n11");
    expect(r.marketplace).toBe("n11");
  });
});

describe("slugToTitle", () => {
  it("converts slug segments to title", () => {
    expect(slugToTitle("siyah-bluetooth-kulaklik")).toBe("siyah bluetooth kulaklik");
  });
});
