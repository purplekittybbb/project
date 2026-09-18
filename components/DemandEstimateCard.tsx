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

// PDF §7.2 Seviye 3 ("Nasıl?") — tahmini oluşturan gerçek sinyallerin Türkçe adları.
const SIGNAL_LABELS: Record<string, string> = {
  stockDelta: "Stok / satış hızı",
  reviewVelocity: "Yorum artış hızı",
  favoriteSignal: "Favori / beğeni sinyali",
  priceSignal: "Fiyat konumu",
};

// PDF §7.2 — her faktörün etki yönü/rengi ve büyüklüğü (feature importance).
function factorMeta(f: { role: "base" | "multiplier"; factor: number }): {
  label: string;
  color: string;
  importance: number;
} {
  if (f.role === "base") {
    return { label: "temel aralığı belirledi", color: "var(--tm-copper)", importance: 1 };
  }
  const imp = Math.abs(f.factor - 1);
  if (f.factor > 1) return { label: `artırdı ×${f.factor.toFixed(2)}`, color: "var(--tm-ledger-green)", importance: imp };
  if (f.factor < 1) return { label: `azalttı ×${f.factor.toFixed(2)}`, color: "var(--tm-alert-clay)", importance: imp };
  return { label: "etkisiz", color: "color-mix(in srgb, var(--tm-ink) 40%, transparent)", importance: 0 };
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
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="text-[10px] uppercase tracking-[0.15em] font-sans"
              style={{ color: "var(--tm-ink)", opacity: 0.45 }}
            >
              {hasReal ? "Önümüzdeki ay öngörüsü" : "Tahmini talep"}
            </span>
            {/* PDF §7 — Seviye 1: çıktının YZ üretimi olduğunu belirten zarif rozet. */}
            <span
              className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-mono"
              style={{
                color: "var(--tm-copper)",
                background: "color-mix(in srgb, var(--tm-copper) 10%, var(--tm-paper))",
                border: "1px solid color-mix(in srgb, var(--tm-copper) 25%, transparent)",
                borderRadius: "var(--tm-r-data, 2px)",
                padding: "1px 5px",
              }}
              title="Bu öngörü, kendi satış sinyallerinizden yapay zekâ ile üretilmiştir — kesin bir taahhüt değildir."
            >
              ◇ AI destekli
            </span>
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

      {/* PDF §7.2 — Karar sınırı / escape hatch: veri sınırlıysa açıkça söyle,
          körü körüne güvendirme; kullanıcıyı kendi verisiyle doğrulamaya yönelt. */}
      {estimate.confidenceLevel === "low" && (
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: "var(--tm-alert-clay)" }}
        >
          Sınırlı veriye dayanıyor — bu aralığa karar için güvenmeden önce kendi satış
          geçmişinizle doğrulayın.
        </p>
      )}

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
          <div className="mt-2 space-y-2">
            <p
              className="text-[12px] font-sans leading-relaxed"
              style={{ color: "var(--tm-ink)", opacity: 0.65 }}
            >
              {estimate.explanation}
            </p>

            {/* PDF §7.2 Seviye 3 — "Nasıl?": ağırlıklı faktör önem grafiği. */}
            {estimate.factors && estimate.factors.length > 0 ? (
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.12em] font-sans mb-1.5"
                  style={{ color: "var(--tm-ink)", opacity: 0.4 }}
                >
                  Faktör ağırlıkları
                </div>
                <div className="space-y-1.5">
                  {(() => {
                    const metas = estimate.factors.map(factorMeta);
                    const maxImp = Math.max(0.0001, ...metas.map((m) => m.importance));
                    return estimate.factors.map((f, i) => {
                      const m = metas[i];
                      const widthPct = Math.max(6, (m.importance / maxImp) * 100);
                      return (
                        <div key={f.signalName} className="flex items-center gap-2 text-[10px]">
                          <span className="w-28 shrink-0 font-sans" style={{ color: "var(--tm-ink)", opacity: 0.7 }}>
                            {SIGNAL_LABELS[f.signalName] ?? f.signalName}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "color-mix(in srgb, var(--tm-ink) 8%, transparent)" }}>
                            <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: m.color }} />
                          </div>
                          <span className="w-24 shrink-0 text-right font-mono" style={{ color: m.color }}>
                            {m.label}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              estimate.signalsUsed && estimate.signalsUsed.length > 0 && (
                <div>
                  <div
                    className="text-[10px] uppercase tracking-[0.12em] font-sans mb-1"
                    style={{ color: "var(--tm-ink)", opacity: 0.4 }}
                  >
                    Kullanılan sinyaller
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {estimate.signalsUsed.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-sans"
                        style={{
                          color: "var(--tm-ink)",
                          opacity: 0.7,
                          background: "color-mix(in srgb, var(--tm-ink) 6%, var(--tm-paper))",
                          border: "1px solid color-mix(in srgb, var(--tm-ink) 12%, transparent)",
                          borderRadius: "var(--tm-r-data, 2px)",
                          padding: "1px 6px",
                        }}
                      >
                        {SIGNAL_LABELS[s] ?? s}
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
