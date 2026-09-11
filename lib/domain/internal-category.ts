/**
 * Internal commission taxonomy.
 *
 * Marketplace APIs return leaf names ("Sports Shoes", "Görüntü Sistemleri",
 * "Elektronik/Kulaklık") that do not match FeeConfig.commissionTable keys.
 * This mapper folds those strings onto the buckets the adapters price with.
 *
 * Missing / unrecognised → "Diğer". Never throws — a wrong-looking default
 * rate is surfaced as "Diğer", not as a hard failure that hides the sale.
 */

export const INTERNAL_CATEGORIES = [
  "Ev & Yaşam",
  "Elektronik",
  "Moda",
  "Kozmetik",
  "Anne & Bebek",
  "Diğer",
] as const;

export type InternalCategory = (typeof INTERNAL_CATEGORIES)[number];

export const FALLBACK_INTERNAL_CATEGORY: InternalCategory = "Diğer";

function fold(value: string): string {
  return value.replace(/İ/g, "i").replace(/I/g, "i").toLowerCase().trim();
}

const EXACT = new Set<string>(INTERNAL_CATEGORIES);

/**
 * Map a marketplace category / businessUnit / product categoryName onto
 * the internal commission bucket. Empty input → Diğer.
 */
export function mapToInternalCategory(raw: string | null | undefined): InternalCategory {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return FALLBACK_INTERNAL_CATEGORY;
  if (EXACT.has(trimmed)) return trimmed as InternalCategory;

  const n = fold(trimmed);

  if (/(anne|bebek|\bbaby\b)/.test(n)) return "Anne & Bebek";
  if (/(kozmetik|parfum|parfüm|guzellik|güzellik|bakim|bakım|cosmetic|beauty)/.test(n)) {
    return "Kozmetik";
  }
  if (
    /(elektronik|telefon|bilgisayar|tablet|laptop|kulakl[iı]k|kamera|televizyon|\btv\b|goruntu|görüntü|headphone|computer|phone)/.test(n)
  ) {
    return "Elektronik";
  }
  if (/(ev\s*&\s*yasam|ev\s*yasam|ev tekstil|mutfak|mobilya|\bhome\b|\bliving\b)/.test(n)) {
    return "Ev & Yaşam";
  }
  if (/(moda|giyim|ayakkab[iı]|tekstil|\bdress\b|\bshoe|\bclothing\b|sports shoes)/.test(n)) {
    return "Moda";
  }

  return FALLBACK_INTERNAL_CATEGORY;
}
