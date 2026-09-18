/**
 * Demand estimation engine — Aşama B.
 *
 * Pure & deterministic: same inputs → same output. No I/O, no Date.now().
 * Follows the same rules as lib/calc/ — 100% branch coverage required.
 *
 * SIGNALS:
 *   stockDelta       — how fast inventory is moving (proxy: daily sales from txs)
 *   reviewVelocity   — new reviews / day (from scraping, optional)
 *   favoriteSignal   — wishlist/favorite count (from scraping, optional)
 *   priceSignal      — price vs. market median (from category_trends, optional)
 *
 * OUTPUT: DemandRangeResult with [rangeLow, rangeHigh] units/month + confidence
 */

// ── Input types ──────────────────────────────────────────────────────────────

export interface StockDeltaSignal {
  /** Observed daily sales rate (units/day) from transaction data. */
  dailySalesRate: number;
  /** How many days of data this rate is based on — affects confidence. */
  dataDays: number;
}

export interface ReviewVelocitySignal {
  /** Current total review count on the listing. */
  currentReviewCount: number;
  /** Previous review count snapshot. */
  previousReviewCount: number;
  /** Days elapsed between the two snapshots. */
  daysBetween: number;
}

export interface FavoriteSignal {
  /** Wishlist / favourite count on the marketplace. */
  favoriteCount: number;
}

export interface PriceSignal {
  /** Current listing price of this product. */
  productPrice: number;
  /** Median price of competing products in the same category keyword. */
  marketMedianPrice: number;
}

export interface DemandInput {
  stockDelta?: StockDeltaSignal;
  reviewVelocity?: ReviewVelocitySignal;
  favorite?: FavoriteSignal;
  price?: PriceSignal;
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface Multiplier {
  factor: number;
  signalName: string;
}

/**
 * PDF §7.2 Seviye 3 — "feature importance": tahmini oluşturan her faktörün
 * ağırlığı. `role: "base"` aralığı belirleyen ana sinyal; `role: "multiplier"`
 * çarpan sinyaller (factor>1 artırır, <1 azaltır, =1 nötr). Etki büyüklüğü
 * |factor − 1| ile ölçülür.
 */
export interface DemandFactor {
  signalName: string;
  factor: number;
  role: "base" | "multiplier";
}

export interface DemandRangeResult {
  /** Units/month lower bound, rounded to nearest 5. */
  rangeLow: number;
  /** Units/month upper bound, rounded to nearest 5. */
  rangeHigh: number;
  /** 0-100 confidence score. */
  confidenceScore: number;
  /** Human-friendly confidence tier. */
  confidenceLevel: "high" | "medium" | "low";
  /** Names of signals that contributed to this estimate. */
  signalsUsed: string[];
  /** PDF §7.2 — ağırlıklı faktörler (feature importance). */
  factors: DemandFactor[];
  /** Turkish human-readable explanation. */
  explanation: string;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Round to the nearest multiple of 5 (ensures clean range output). */
function roundToNearest5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** Clamp a number between min and max (inclusive). */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ── Signal computers ─────────────────────────────────────────────────────────

/**
 * Compute the base demand range from daily sales velocity.
 *
 * rangeLow  = dailySalesRate × 28 × 0.8   (20% conservative buffer)
 * rangeHigh = dailySalesRate × 31 × 1.3   (30% optimistic upside)
 *
 * confidenceScore:
 *   60 — fewer than 30 days of data (short window, less reliable)
 *   80 — 30 or more days of data (longer window, more reliable)
 */
export function computeStockDeltaSignal(signal: StockDeltaSignal): {
  rangeLow: number;
  rangeHigh: number;
  confidenceScore: number;
} {
  const { dailySalesRate, dataDays } = signal;
  const rangeLow = dailySalesRate * 28 * 0.8;
  const rangeHigh = dailySalesRate * 31 * 1.3;
  const confidenceScore = dataDays >= 30 ? 80 : 60;
  return { rangeLow, rangeHigh, confidenceScore };
}

/**
 * Compute a multiplier from review velocity.
 *
 * reviewsPerDay = (currentCount - previousCount) / days
 * High velocity (> 1 review/day)   → boost range by 20% (factor 1.2)
 * Low velocity  (< 0.1 review/day) → reduce range by 10% (factor 0.9)
 * Moderate                         → neutral (factor 1.0)
 */
export function computeReviewVelocitySignal(signal: ReviewVelocitySignal): Multiplier {
  const { currentReviewCount, previousReviewCount, daysBetween } = signal;
  const reviewsDelta = currentReviewCount - previousReviewCount;
  const reviewsPerDay = daysBetween > 0 ? reviewsDelta / daysBetween : 0;

  let factor: number;
  if (reviewsPerDay > 1) {
    factor = 1.2;
  } else if (reviewsPerDay < 0.1) {
    factor = 0.9;
  } else {
    factor = 1.0;
  }

  return { factor, signalName: "reviewVelocity" };
}

/**
 * Compute a multiplier from the favourite/wishlist count.
 *
 * < 100  favourites: neutral  (factor 1.0)
 * 100–500 favourites: slight boost (factor 1.1)
 * > 500  favourites: moderate boost (factor 1.2)
 */
export function computeFavoriteSignal(signal: FavoriteSignal): Multiplier {
  const { favoriteCount } = signal;
  let factor: number;
  if (favoriteCount > 500) {
    factor = 1.2;
  } else if (favoriteCount >= 100) {
    factor = 1.1;
  } else {
    factor = 1.0;
  }
  return { factor, signalName: "favoriteSignal" };
}

/**
 * Compute a multiplier from product price relative to the market median.
 *
 * price < 0.8 × median  → strong demand pull (factor 1.3)
 * 0.8–1.2 × median      → neutral (factor 1.0)
 * price > 1.2 × median  → demand drag (factor 0.85)
 */
export function computePriceSignal(signal: PriceSignal): Multiplier {
  const { productPrice, marketMedianPrice } = signal;

  if (marketMedianPrice <= 0) {
    return { factor: 1.0, signalName: "priceSignal" };
  }

  const ratio = productPrice / marketMedianPrice;
  let factor: number;
  if (ratio < 0.8) {
    factor = 1.3;
  } else if (ratio <= 1.2) {
    factor = 1.0;
  } else {
    factor = 0.85;
  }
  return { factor, signalName: "priceSignal" };
}

// ── Main estimator ────────────────────────────────────────────────────────────

/**
 * Combine all available demand signals into a single estimate.
 *
 * Algorithm:
 *   1. Start with stockDelta as base range (required; falls back to wide
 *      low-confidence [0, 1000] range when not provided).
 *   2. Apply multipliers from each optional signal in order.
 *   3. Round both bounds to the nearest 5.
 *   4. Compute confidence: base + 10 per additional signal, cap at 95.
 *   5. Determine level: ≥70 → "high", ≥45 → "medium", else → "low".
 *   6. Build Turkish explanation.
 */
export function estimateDemand(input: DemandInput): DemandRangeResult {
  const signalsUsed: string[] = [];
  const multipliers: Multiplier[] = [];

  // ── Step 1: base range from stockDelta ────────────────────────────────────
  let rangeLow: number;
  let rangeHigh: number;
  let baseConfidence: number;

  if (input.stockDelta) {
    const base = computeStockDeltaSignal(input.stockDelta);
    rangeLow = base.rangeLow;
    rangeHigh = base.rangeHigh;
    baseConfidence = base.confidenceScore;
    signalsUsed.push("stockDelta");
  } else {
    // No stock data — wide, low-confidence range
    rangeLow = 0;
    rangeHigh = 1000;
    baseConfidence = 20;
  }

  // ── Step 2: optional signal multipliers ───────────────────────────────────
  if (input.reviewVelocity) {
    multipliers.push(computeReviewVelocitySignal(input.reviewVelocity));
    signalsUsed.push("reviewVelocity");
  }
  if (input.favorite) {
    multipliers.push(computeFavoriteSignal(input.favorite));
    signalsUsed.push("favoriteSignal");
  }
  if (input.price) {
    multipliers.push(computePriceSignal(input.price));
    signalsUsed.push("priceSignal");
  }

  // Apply multipliers (compound them)
  const totalMultiplier = multipliers.reduce((acc, m) => acc * m.factor, 1.0);
  rangeLow *= totalMultiplier;
  rangeHigh *= totalMultiplier;

  // ── Step 3: round to nearest 5 ────────────────────────────────────────────
  rangeLow = roundToNearest5(Math.max(0, rangeLow));
  rangeHigh = roundToNearest5(Math.max(0, rangeHigh));

  // ── Step 4: confidence ────────────────────────────────────────────────────
  const additionalSignals = signalsUsed.length - (input.stockDelta ? 1 : 0);
  const confidenceScore = clamp(baseConfidence + additionalSignals * 10, 0, 95);

  // ── Step 5: confidence level ──────────────────────────────────────────────
  let confidenceLevel: "high" | "medium" | "low";
  if (confidenceScore >= 70) {
    confidenceLevel = "high";
  } else if (confidenceScore >= 45) {
    confidenceLevel = "medium";
  } else {
    confidenceLevel = "low";
  }

  // ── Step 6: Turkish explanation ───────────────────────────────────────────
  const explanation = buildTurkishExplanation(signalsUsed, rangeLow, rangeHigh, confidenceLevel);

  // ── Step 7: weighted factors (PDF §7.2 feature importance) ────────────────
  const factors: DemandFactor[] = [];
  if (input.stockDelta) {
    factors.push({ signalName: "stockDelta", factor: 1, role: "base" });
  }
  for (const m of multipliers) {
    factors.push({ signalName: m.signalName, factor: m.factor, role: "multiplier" });
  }

  return {
    rangeLow,
    rangeHigh,
    confidenceScore,
    confidenceLevel,
    signalsUsed,
    factors,
    explanation,
  };
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildTurkishExplanation(
  signalsUsed: string[],
  rangeLow: number,
  rangeHigh: number,
  confidenceLevel: "high" | "medium" | "low"
): string {
  const levelTr =
    confidenceLevel === "high"
      ? "yüksek"
      : confidenceLevel === "medium"
      ? "orta"
      : "düşük";

  const SIGNAL_TR: Record<string, string> = {
    stockDelta: "satış hızı",
    reviewVelocity: "yorum akışı",
    favoriteSignal: "favori sayısı",
    priceSignal: "fiyat konumu",
  };

  // Translate known signal names; filter any unexpected values.
  const parts = signalsUsed
    .map((s) => SIGNAL_TR[s])
    .filter((s): s is string => s !== undefined);

  const signalText =
    parts.length === 0
      ? "herhangi bir sinyal"
      : parts.join(", ");

  return (
    `Aylık talep tahmini ${rangeLow}–${rangeHigh} adet. ` +
    `Bu tahmin ${signalText} sinyalleri kullanılarak oluşturuldu. ` +
    `Güven düzeyi: ${levelTr}.`
  );
}
