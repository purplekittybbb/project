/**
 * Scan priority queue — decides which products to scan next for
 * visibility / demand data.
 *
 * Priority factors (higher score = scan sooner):
 *   loss sku                : +40 pts  (urgently need data on losers)
 *   silent loser            : +30 pts
 *   never scanned           : +20 pts
 *   last scanned > 7 days   : +10 pts
 *   last scanned > 14 days  : +20 pts  (incremental, on top of the 7-day one)
 *   thin margin (0–5%)      : +15 pts
 *
 * Pure function — takes skuMargins + last-scan timestamps, returns an ordered queue.
 * No I/O, no Date.now() — pass `referenceTime` for deterministic testing.
 */

import type { SkuMargin } from "../domain/margin-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanJob {
  sku: string;
  marketplace: string;
  priorityScore: number;
  /** Turkish reasons explaining this priority score (for logging / UI). */
  reason: string[];
  /** When to run: spread 5 min apart starting from referenceTime + 1 min. */
  scheduledAt: Date;
}

export interface QueueInput {
  skus: SkuMargin[];
  marketplace: string;
  /**
   * Map of sku → ISO timestamp of last scan.
   * A missing entry means the SKU has never been scanned.
   */
  lastScans: Map<string, string>;
  /**
   * "now" reference for deterministic testing.
   * In production, pass `new Date()`.
   */
  referenceTime: Date;
}

// ── Internal scoring ──────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ScoredSku {
  sku: SkuMargin;
  score: number;
  reasons: string[];
}

function scoreSkuMargin(
  sku: SkuMargin,
  lastScanTs: string | undefined,
  referenceTime: Date
): ScoredSku {
  let score = 0;
  const reasons: string[] = [];

  // Loss sku: trueMarginPct < 0
  if (sku.trueMarginPct < 0) {
    score += 40;
    reasons.push("Zarar eden ürün (+40)");
  }

  // Silent loser: looks profitable (perceived > 0) but truly negative
  if (sku.isSilentLoser) {
    score += 30;
    reasons.push("Gizli zarar (+30)");
  }

  // Never scanned
  if (!lastScanTs) {
    score += 20;
    reasons.push("Hiç taranmamış (+20)");
  } else {
    const lastScanDate = new Date(lastScanTs).getTime();
    const refTime = referenceTime.getTime();
    const daysSinceScan = (refTime - lastScanDate) / MS_PER_DAY;

    if (daysSinceScan > 14) {
      score += 20; // incremental on top of the >7 bonus
      score += 10;
      reasons.push("14 günden uzun süredir taranmadı (+20+10)");
    } else if (daysSinceScan > 7) {
      score += 10;
      reasons.push("7 günden uzun süredir taranmadı (+10)");
    }
  }

  // Thin margin: 0 <= trueMarginPct <= 5
  if (sku.trueMarginPct >= 0 && sku.trueMarginPct <= 5) {
    score += 15;
    reasons.push("Düşük marj (%0–5) (+15)");
  }

  return { sku, score, reasons };
}

// ── Main queue builder ────────────────────────────────────────────────────────

/**
 * Build a prioritised scan queue.
 *
 * Jobs are spread 5 minutes apart, starting 1 minute after `referenceTime`.
 * This avoids rate-limit spikes when submitting many jobs at once.
 */
export function buildScanQueue(input: QueueInput): ScanJob[] {
  const { skus, marketplace, lastScans, referenceTime } = input;

  // Score every SKU
  const scored: ScoredSku[] = skus.map((sku) =>
    scoreSkuMargin(sku, lastScans.get(sku.sku), referenceTime)
  );

  // Sort: highest score first; tie-break alphabetically by sku
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.sku.sku.localeCompare(b.sku.sku);
  });

  // Assign scheduled times: +1 min for the first job, +5 min for each subsequent
  const MS_PER_MINUTE = 60 * 1000;
  const baseTime = referenceTime.getTime() + MS_PER_MINUTE;
  const SPREAD_MS = 5 * MS_PER_MINUTE;

  return scored.map((s, i) => ({
    sku: s.sku.sku,
    marketplace,
    priorityScore: s.score,
    reason: s.reasons,
    scheduledAt: new Date(baseTime + i * SPREAD_MS),
  }));
}
