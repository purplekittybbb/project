/**
 * Parse a guest tool query — plain keyword or marketplace product URL.
 */

export type ToolMarketplace = "trendyol" | "hepsiburada" | "n11";

export interface ParsedToolQuery {
  type: "keyword" | "url";
  marketplace: ToolMarketplace;
  keyword: string;
  /** Product title substring used for rank/index matching. */
  targetTitle: string;
  productUrl?: string;
}

const HOST_TO_MARKETPLACE: Record<string, ToolMarketplace> = {
  "trendyol.com": "trendyol",
  "www.trendyol.com": "trendyol",
  "hepsiburada.com": "hepsiburada",
  "www.hepsiburada.com": "hepsiburada",
  "n11.com": "n11",
  "www.n11.com": "n11",
};

function normalizeMarketplace(value?: string): ToolMarketplace | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "trendyol" || v === "hepsiburada" || v === "n11") return v;
  return undefined;
}

/** Turn a URL path segment into a human-readable title guess. */
export function slugToTitle(slug: string): string {
  const cleaned = slug
    .replace(/-p-\d+.*/i, "")
    .replace(/\/p-.*/i, "")
    .replace(/\.html$/i, "");
  return decodeURIComponent(cleaned.replace(/-/g, " ")).trim();
}

function detectMarketplaceFromHost(hostname: string): ToolMarketplace | undefined {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return HOST_TO_MARKETPLACE[host] ?? HOST_TO_MARKETPLACE[`www.${host}`];
}

function titleFromProductUrl(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const fromSlug = slugToTitle(last);
  if (fromSlug.length >= 3) return fromSlug;

  // Hepsiburada sometimes uses /product-name-p-HBCV123
  const joined = parts.map((p) => slugToTitle(p)).filter((p) => p.length >= 3);
  return joined[joined.length - 1] ?? fromSlug;
}

/**
 * Parse user input for standalone tools.
 * Accepts a keyword or a marketplace product/listing URL.
 */
export function parseToolQuery(raw: string, marketplaceOverride?: string): ParsedToolQuery {
  const trimmed = raw.trim();
  const override = normalizeMarketplace(marketplaceOverride);

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const marketplace = override ?? detectMarketplaceFromHost(url.hostname) ?? "trendyol";
      const targetTitle = titleFromProductUrl(url);
      const keyword = targetTitle.length >= 3 ? targetTitle : trimmed;
      return {
        type: "url",
        marketplace,
        keyword,
        targetTitle: targetTitle.length >= 3 ? targetTitle : keyword,
        productUrl: trimmed,
      };
    } catch {
      // fall through to keyword mode
    }
  }

  return {
    type: "keyword",
    marketplace: override ?? "trendyol",
    keyword: trimmed,
    targetTitle: trimmed,
  };
}
