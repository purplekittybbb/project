import { describe, expect, it, afterEach } from "vitest";
import { scraperProxyFromEnv } from "@/lib/scrapers/browser";

describe("scraperProxyFromEnv", () => {
  const prev = process.env.SCRAPER_PROXY_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.SCRAPER_PROXY_URL;
    else process.env.SCRAPER_PROXY_URL = prev;
  });

  it("returns undefined when unset", () => {
    delete process.env.SCRAPER_PROXY_URL;
    expect(scraperProxyFromEnv()).toBeUndefined();
  });

  it("returns server from SCRAPER_PROXY_URL", () => {
    process.env.SCRAPER_PROXY_URL = "http://user:pass@proxy.example:8080";
    expect(scraperProxyFromEnv()).toEqual({ server: "http://user:pass@proxy.example:8080" });
  });

  it("trims whitespace", () => {
    process.env.SCRAPER_PROXY_URL = "  http://proxy.test  ";
    expect(scraperProxyFromEnv()).toEqual({ server: "http://proxy.test" });
  });
});
