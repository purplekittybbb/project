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
  /** Real trailing-30-day units actually sold (the historical figure the
   *  marketing promises). When provided, shown as the headline number and the
   *  projected range is clearly labeled as a forward-looking forecast. */
  last30Units?: number;
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
    // PDF §7.2 — Orta güven = amber/turuncu (Yüksek=yeşil, Düşük=gri). Marka
    // mavisinden bağımsız, sabit amber.
    label: "Orta güven",
    color: "#B45309",
    bg: "color-mix(in srgb, #B45309 10%, var(--tm-paper))",
    border: "color-mix(in srgb, #B45309 25%, transparent)",
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

export function DemandEstimateCard({ estimate, sku, last30Units, className }: DemandEstimateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = BADGE_CONFIG[estimate.confidenceLevel];
  const hasReal = last30Units != null;

  return (
    <div
      className={className}
      style={{
        padding: "12px 14px",
        border: "1px solid color-mix(in srgb, var(--tm-ink) 10%, transparent)",
        borderRadius: "var(--tm-r-data, 2px)",
        background: "var(--tm-paper)",
      }}
      aria-label={`${sku} talep`}
    >
      {/* ── Headline: REAL trailing-30-day units sold (the promised metric) ── */}
      {hasReal && (
        <div className="mb-3 pb-3" style={{ borderBottom: "1px solid color-mix(in srgb, var(--tm-ink) 8%, transparent)" }}>
          <div
            className="text-[10px] uppercase tracking-[0.15em] font-sans mb-1"
            style={{ color: "var(--tm-ink)", opacity: 0.45 }}
          >
            Son 30 günde satılan
          </div>
          <div className="text-[19px] font-mono tabular-nums font-semibold" style={{ color: "var(--tm-ink)" }}>
            {new Intl.NumberFormat("tr-TR").format(last30Units)} adet
          </div>
        </div>
      )}

      {/* ── Level 1: forward projection (probabilistic — smaller weight) ───── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.15em] font-sans mb-1"
            style={{ color: "var(--tm-ink)", opacity: 0.45 }}
          >
            {hasReal ? "Önümüzdeki ay öngörüsü" : "Tahmini talep"}
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
