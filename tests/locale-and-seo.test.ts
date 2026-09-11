import { describe, expect, it } from "vitest";
import { localeForMarketplace } from "@/lib/domain/locale";
import { pageMetadata, softwareApplicationJsonLd, siteOrigin } from "@/lib/seo";

describe("localeForMarketplace — schema check (Aşama D)", () => {
  it("maps known marketplaces without guessing a new country integration", () => {
    expect(localeForMarketplace("trendyol")).toEqual({ currency: "TRY", countryCode: "TR" });
    expect(localeForMarketplace("n11")).toEqual({ currency: "TRY", countryCode: "TR" });
    expect(localeForMarketplace("amazon_tr")).toEqual({ currency: "TRY", countryCode: "TR" });
    expect(localeForMarketplace("amazon_us")).toEqual({ currency: "USD", countryCode: "US" });
  });

  it("unknown marketplace defaults to TRY/TR (launch cohort), does not throw", () => {
    expect(localeForMarketplace("ebay")).toEqual({ currency: "TRY", countryCode: "TR" });
  });
});

describe("SEO helpers", () => {
  it("pageMetadata includes OG, Twitter, and robots", () => {
    const m = pageMetadata({
      title: "Giriş",
      description: "desc",
      path: "/login",
    });
    expect(m.openGraph?.title).toBe("Giriş");
    expect((m.twitter as { card?: string } | undefined)?.card).toBe("summary_large_image");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("private pages set robots noindex", () => {
    const m = pageMetadata({
      title: "Panel",
      description: "x",
      path: "/dashboard",
      index: false,
    });
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("JSON-LD is SoftwareApplication with a name and url", () => {
    const ld = softwareApplicationJsonLd();
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.name).toBe("TrueMargin");
    expect(String(ld.url)).toContain(siteOrigin().replace("https://", ""));
  });
});
