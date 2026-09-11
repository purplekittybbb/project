/**
 * Loss alarm — automatic detection of money-losing / at-risk SKUs.
 *
 * Pure & deterministic: turns the per-SKU margin view (see perSkuMargins in
 * lib/domain/margin-engine.ts) into a structured, ranked list of alarms. This
 * is the "automatic" half of the loss alarm; the "persistent" half lives in
 * lib/supabase/loss-alarms.ts, which stores what this function finds so a loss
 * is recorded over time instead of only being a transient colour in the UI.
 *
 * No I/O, no framework, no Date — the same SKUs always produce the same alarms.
 */

import type { SkuMargin } from "../domain/margin-engine";

/**
 * Severity of a SKU-level alarm, most→least severe:
 *   silent-loss  — looks profitable (perceived > 0) but true margin is negative
 *   loss         — true margin is negative and it already looks unprofitable
 *   thin-margin  — positive but below the safety threshold
 *   return-risk  — otherwise healthy margin, but return rate is dangerously high
 */
export type LossAlarmLevel = "silent-loss" | "loss" | "thin-margin" | "return-risk";

export interface LossAlarmThresholds {
  /** A positive true margin below this % counts as "thin". */
  thinMarginPct: number;
  /** A return rate above this % raises a return-risk alarm. */
  returnRatePct: number;
}

export const DEFAULT_LOSS_ALARM_THRESHOLDS: LossAlarmThresholds = {
  thinMarginPct: 5,
  returnRatePct: 8,
};

export interface LossAlarm {
  sku: string;
  category: string;
  level: LossAlarmLevel;
  trueMarginPct: number;
  perceivedMarginPct: number;
  returnRatePct: number;
  /** True when it looks profitable but truly loses money. */
  isSilentLoser: boolean;
  /** Gentle, factual Turkish explanation (no blaming language). */
  message: string;
}

/** Rank used for sorting: lower number = more severe / shown first. */
const LEVEL_RANK: Record<LossAlarmLevel, number> = {
  "silent-loss": 0,
  loss: 1,
  "thin-margin": 2,
  "return-risk": 3,
};

/** Classify one SKU. Returns null when it is healthy (no alarm). */
function classify(sku: SkuMargin, thresholds: LossAlarmThresholds): LossAlarmLevel | null {
  if (sku.trueMarginPct < 0) return sku.isSilentLoser ? "silent-loss" : "loss";
  if (sku.trueMarginPct < thresholds.thinMarginPct) return "thin-margin";
  if (sku.returnRatePct > thresholds.returnRatePct) return "return-risk";
  return null;
}

function messageFor(sku: SkuMargin, level: LossAlarmLevel): string {
  const trueM = sku.trueMarginPct.toFixed(1);
  const ret = sku.returnRatePct.toFixed(1);
  switch (level) {
    case "silent-loss":
      return `${sku.sku}: kârlı görünüyor ama gerçekte zarar ediyor (gerçek marj %${trueM}).`;
    case "loss":
      return `${sku.sku}: zarar ediyor (gerçek marj %${trueM}).`;
    case "thin-margin":
      return `${sku.sku}: marj çok ince (gerçek marj %${trueM}).`;
    case "return-risk":
      return `${sku.sku}: iade oranı yüksek (%${ret}) — kârı eritebilir.`;
  }
}

/**
 * Detect every SKU that should raise an alarm, ranked most-severe first (ties
 * broken by the worst true margin). Healthy SKUs are omitted.
 */
export function detectLossAlarms(
  skus: SkuMargin[],
  thresholds: LossAlarmThresholds = DEFAULT_LOSS_ALARM_THRESHOLDS,
): LossAlarm[] {
  const alarms: LossAlarm[] = [];
  for (const sku of skus) {
    const level = classify(sku, thresholds);
    if (level === null) continue;
    alarms.push({
      sku: sku.sku,
      category: sku.category,
      level,
      trueMarginPct: sku.trueMarginPct,
      perceivedMarginPct: sku.perceivedMarginPct,
      returnRatePct: sku.returnRatePct,
      isSilentLoser: sku.isSilentLoser,
      message: messageFor(sku, level),
    });
  }
  return alarms.sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.trueMarginPct - b.trueMarginPct,
  );
}
