"use client";

/**
 * DemandEstimateCard — spec §5 Confidence UI / XAI kademeli açıklama.
 *
 * Level 1 (always visible):
 *   - Range: "180–260 adet/ay"
 *   - Confidence badge: Yeşil/Turuncu/Gri (Yüksek/Orta/Düşük)
 *
 * Level 2 (expandable, "Neden bu tahmin?" link):
 *   - Turkish explanation from DemandRangeResult.explanation
 *
 * RULE (spec §5): deterministic net-profit (kesin/siyah punto) vs.
 * probabilistic demand (aralık, küçük punto, etiketli) — never same visual weight.
 *
 * This means: demand range always renders smaller than a final net-profit figure,
 * with the confidence badge clearly marking it as probabilistic.
 */

import { useState } from "react";
import type { DemandRangeResult } from "@/lib/demand/signals";

export interface DemandEstimateCardProps {
  estimate: DemandRangeResult;
  sku: string;
  className?: string;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const BADGE_CONFIG = {
  high: {
    label: "Yüksek güven",
    color: "var(--tm-ledger-green)",
    bg: "color-mix(in srgb, var(--tm-ledger-green) 12%, var(--tm-paper))",
    border: "color-mix(in srgb, var(--tm-ledger-green) 30%, transparent)",
  },
  medium: {
    label: "Orta güven",
    color: "var(--tm-copper, #b45309)",
    bg: "color-mix(in srgb, var(--tm-copper, #b45309) 10%, var(--tm-paper))",
    border: "color-mix(in srgb, var(--tm-copper, #b45309) 25%, transparent)",
  },
  low: {
    label: "Düşük güven",
    color: "var(--tm-ink)",
    bg: "var(--tm-mist, #f4f4f5)",
    border: "color-mix(in srgb, var(--tm-ink) 15%, transparent)",
  },
} as const;

function fmtRange(low: number, high: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(low)}–${new Intl.NumberFormat("tr-TR").format(high)} adet/ay`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DemandEstimateCard({ estimate, sku, className }: DemandEstimateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = BADGE_CONFIG[estimate.confidenceLevel];

  return (
    <div
      className={className}
      style={{
        padding: "12px 14px",
        border: "1px solid color-mix(in srgb, var(--tm-ink) 10%, transparent)",
        borderRadius: "var(--tm-r-data, 2px)",
        background: "var(--tm-paper)",
      }}
      aria-label={`${sku} talep tahmini`}
    >
      {/* ── Level 1: always visible ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Range (probabilistic — smaller font than net-profit per spec §5) */}
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.15em] font-sans mb-1"
            style={{ color: "var(--tm-ink)", opacity: 0.45 }}
          >
            Tahmini talep
          </div>
          <div
            className="text-[15px] font-mono tabular-nums"
            style={{ color: "var(--tm-ink)", opacity: 0.8 }}
          >
            {fmtRange(estimate.rangeLow, estimate.rangeHigh)}
          </div>
        </div>

        {/* Confidence badge */}
        <span
          className="text-[10px] px-2 py-1 font-mono uppercase tracking-widest"
          style={{
            color: badge.color,
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            borderRadius: "var(--tm-r-data, 2px)",
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* ── Level 2: expandable explanation ────────────────────────────── */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="text-[11px] font-sans underline underline-offset-2 cursor-pointer"
          style={{ color: "var(--tm-ink)", opacity: 0.45, background: "none", border: "none", padding: 0 }}
          aria-expanded={expanded}
        >
          {expanded ? "Gizle" : "Neden bu tahmin?"}
        </button>

        {expanded && (
          <p
            className="mt-2 text-[12px] font-sans leading-relaxed"
            style={{ color: "var(--tm-ink)", opacity: 0.65 }}
          >
            {estimate.explanation}
          </p>
        )}
      </div>
    </div>
  );
}
