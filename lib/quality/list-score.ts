/**
 * List Quality Score — quantifies how well a product listing is optimised.
 *
 * Works with existing API data (no scraping required for basic score).
 * Full score requires scraping (image count, description length) — those
 * fields are optional; their absence lowers the score gracefully.
 *
 * Pure & deterministic: no I/O, no Date, no framework imports.
 * 100% branch coverage required (same rule as lib/calc/).
 *
 * Scoring dimensions (0-100 total):
 *   titleLength      0-30  — 40-80 chars: full score; <20 or >120: 0
 *   keywordQuality   0-20  — title contains category keyword: +10, brand: +10
 *   categoryDepth    0-20  — subcategory present (slash count): more depth = more
 *   salesHealth      0-15  — based on return rate (low return = healthy)
 *   imageCount       0-15  — requires scraping: null → partial score (7 pts)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListQualityInput {
  /** Product name from API. */
  title: string;
  /** Category from API, e.g. "Elektronik/Kulaklık/Bluetooth". */
  categoryName: string;
  /** SKU identifier. */
  sku: string;
  /** Return rate as a percentage, 0-100 (not 0-1). */
  returnRatePct: number;
  /** Number of product images (from scraping). Optional. */
  imageCount?: number;
  /** Description character length (from scraping). Optional. */
  descriptionLength?: number;
}

export interface ListQualityBreakdown {
  titleLength:    number;   // 0-30
  keywordQuality: number;   // 0-20
  categoryDepth:  number;   // 0-20
  salesHealth:    number;   // 0-15
  imageCount:     number;   // 0-15
}

export interface ListQualityScore {
  /** Sum of breakdown dimensions, 0-100. */
  total: number;
  breakdown: ListQualityBreakdown;
  /** A≥80, B≥60, C≥40, D<40 */
  grade: "A" | "B" | "C" | "D";
  /** Turkish actionable suggestions (max 3). */
  issues: string[];
  /** true when imageCount or descriptionLength were not provided. */
  scrapingDataMissing: boolean;
}

// ── Scoring functions ─────────────────────────────────────────────────────────

/**
 * titleLength score (0-30):
 *   [40, 80]   → 30 pts  (ideal)
 *   [20, 40) or (80, 120] → 20 pts
 *   [10, 20) or (120, 150] → 10 pts
 *   else → 0 pts
 */
function scoreTitleLength(title: string): number {
  const len = title.length;
  if (len >= 40 && len <= 80) return 30;
  if ((len >= 20 && len < 40) || (len > 80 && len <= 120)) return 20;
  if ((len >= 10 && len < 20) || (len > 120 && len <= 150)) return 10;
  return 0;
}

/**
 * keywordQuality score (0-20):
 *   title contains the root category keyword → +10
 *   title has a recognisable brand marker    → +10
 *     (brand marker = ≥3 consecutive ALL_CAPS characters, OR title has ≥3 words)
 */
function scoreKeywordQuality(title: string, categoryName: string): number {
  let score = 0;

  // Root category = first slash-delimited segment
  const rootCategory = categoryName.split("/")[0].toLowerCase().trim();
  if (rootCategory && title.toLowerCase().includes(rootCategory)) {
    score += 10;
  }

  // Brand marker heuristic
  const hasAllCapsWord = /[A-ZÇĞİÖŞÜ]{3,}/.test(title);
  const wordCount = title.trim().split(/\s+/).length;
  if (hasAllCapsWord || wordCount >= 3) {
    score += 10;
  }

  return score;
}

/**
 * categoryDepth score (0-20):
 *   0 slashes → 0 pts
 *   1 slash   → 10 pts
 *   2 slashes → 15 pts
 *   ≥3 slashes → 20 pts
 */
function scoreCategoryDepth(categoryName: string): number {
  const slashes = (categoryName.match(/\//g) ?? []).length;
  if (slashes >= 3) return 20;
  if (slashes === 2) return 15;
  if (slashes === 1) return 10;
  return 0;
}

/**
 * salesHealth score (0-15):
 *   returnRatePct 0-3%   → 15 pts
 *   returnRatePct 3-8%   → 10 pts
 *   returnRatePct 8-15%  → 5 pts
 *   returnRatePct > 15%  → 0 pts
 */
function scoreSalesHealth(returnRatePct: number): number {
  if (returnRatePct <= 3) return 15;
  if (returnRatePct <= 8) return 10;
  if (returnRatePct <= 15) return 5;
  return 0;
}

/**
 * imageCount score (0-15):
 *   null/undefined → 7 pts (partial; missing scraping data)
 *   0             → 0 pts
 *   1-2           → 5 pts
 *   3-5           → 10 pts
 *   ≥6            → 15 pts
 */
function scoreImageCount(imageCount: number | undefined): number {
  if (imageCount == null) return 7;
  if (imageCount === 0) return 0;
  if (imageCount <= 2) return 5;
  if (imageCount <= 5) return 10;
  return 15;
}

// ── Issue generator ───────────────────────────────────────────────────────────

function generateIssues(
  input: ListQualityInput,
  breakdown: ListQualityBreakdown
): string[] {
  const issues: string[] = [];

  // titleLength issues
  if (input.title.length < 30) {
    issues.push("Ürün başlığı çok kısa — anahtar kelimeleri ekleyin (40-80 karakter önerilir)");
  } else if (input.title.length > 100) {
    issues.push("Başlık çok uzun — ana anahtar kelimeleri öne alın");
  }

  // keywordQuality issue
  if (breakdown.keywordQuality < 15) {
    issues.push("Başlıkta kategori anahtar kelimesi eksik");
  }

  // categoryDepth issue
  if (breakdown.categoryDepth < 2) {
    issues.push("Kategori yolu daha spesifik olabilir");
  }

  // salesHealth / return rate issue
  if (input.returnRatePct > 8) {
    issues.push("Yüksek iade oranı ürün açıklamasında yanıltıcı bilgi olduğuna işaret edebilir");
  }

  // imageCount issue (only if imageCount was actually provided)
  if (input.imageCount != null && input.imageCount < 3) {
    issues.push("Görsel sayısı yetersiz — en az 6 yüksek kalite görsel önerilir");
  }

  // Return max 3 issues
  return issues.slice(0, 3);
}

// ── Grade assignment ──────────────────────────────────────────────────────────

function assignGrade(total: number): "A" | "B" | "C" | "D" {
  if (total >= 80) return "A";
  if (total >= 60) return "B";
  if (total >= 40) return "C";
  return "D";
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Compute the list quality score for a product listing.
 *
 * @param input - Listing data (title, category, return rate, optional scraping fields)
 * @returns Full quality score with breakdown, grade, and Turkish actionable issues.
 */
export function computeListQuality(input: ListQualityInput): ListQualityScore {
  const breakdown: ListQualityBreakdown = {
    titleLength:    scoreTitleLength(input.title),
    keywordQuality: scoreKeywordQuality(input.title, input.categoryName),
    categoryDepth:  scoreCategoryDepth(input.categoryName),
    salesHealth:    scoreSalesHealth(input.returnRatePct),
    imageCount:     scoreImageCount(input.imageCount),
  };

  const total = Math.min(
    100,
    breakdown.titleLength +
      breakdown.keywordQuality +
      breakdown.categoryDepth +
      breakdown.salesHealth +
      breakdown.imageCount
  );

  const grade = assignGrade(total);
  const issues = generateIssues(input, breakdown);
  const scrapingDataMissing =
    input.imageCount == null || input.descriptionLength == null;

  return {
    total,
    breakdown,
    grade,
    issues,
    scrapingDataMissing,
  };
}
