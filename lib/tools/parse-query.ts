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

/**
 * Recover a usable marketplace URL when the user pastes a concatenated /
 * doubled link (common on mobile copy). Takes the last host occurrence.
 */
export function recoverMarketplaceUrl(raw: string): string {
  const hostRe = /https?:\/\/(?:www\.)?(?:trendyol|hepsiburada|n11)\.com/gi;
  let lastIndex = -1;
  let lastHost = "";
  let match: RegExpExecArray | null;
  while ((match = hostRe.exec(raw)) !== null) {
    lastIndex = match.index;
    lastHost = match[0];
  }
  if (lastIndex < 0) return raw;
  return lastHost + raw.slice(lastIndex + lastHost.length);
}

function titleFromProductUrl(url: URL): string {
  const q = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (q && q.trim().length >= 2) return q.trim();

  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const productSlug = last.replace(/-p-[a-z0-9]+.*$/i, "").replace(/\.html$/i, "");
  const fromSlug = slugToTitle(productSlug);
  if (fromSlug.length >= 3) return fromSlug;

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

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || /trendyol\.com|hepsiburada\.com|n11\.com/i.test(trimmed)) {
    try {
      const recovered = recoverMarketplaceUrl(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const url = new URL(recovered);
      const marketplace = override ?? detectMarketplaceFromHost(url.hostname) ?? "trendyol";
      const targetTitle = titleFromProductUrl(url);
      const keyword = targetTitle.length >= 3 ? targetTitle : trimmed;
      return {
        type: "url",
        marketplace,
        keyword,
        targetTitle: targetTitle.length >= 3 ? targetTitle : keyword,
        productUrl: recovered,
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
