"use client";

import { useState, type ReactNode } from "react";
import { XaiExplainSheet, type XaiFactorBar } from "@/components/trust/XaiExplainSheet";

export type AiConfidenceLevel = "high" | "medium" | "low";

const BADGE: Record<
  AiConfidenceLevel,
  { label: string; color: string; bg: string; border: string }
> = {
  high: {
    label: "Tahmin güveni: Yüksek",
    color: "var(--tm-ledger-green)",
    bg: "color-mix(in srgb, var(--tm-ledger-green) 12%, transparent)",
    border: "color-mix(in srgb, var(--tm-ledger-green) 30%, transparent)",
  },
  medium: {
    label: "Tahmin güveni: Orta",
    color: "#B45309",
    bg: "color-mix(in srgb, #B45309 10%, transparent)",
    border: "color-mix(in srgb, #B45309 25%, transparent)",
  },
  low: {
    label: "Tahmin güveni: Düşük",
    color: "var(--tm-ink)",
    bg: "var(--tm-mist)",
    border: "color-mix(in srgb, var(--tm-ink) 15%, transparent)",
  },
};

/**
 * PDF §7.2 XAI — Ne? / Neden? / Nasıl? kademeli açıklama.
 * Copilot, top100 ve diğer AI çıktıları için ortak Confidence UI.
 */
export function AiConfidenceBlock({
  level,
  why,
  how,
  factors,
  sheetTitle = "Karar mantığı — Nasıl?",
  aiLabel = "AI Destekli",
  limitedData = false,
  children,
}: {
  level: AiConfidenceLevel;
  /** Seviye 2 — insani dilde neden */
  why: string;
  /** Seviye 3 satır içi özet (opsiyonel; Detayları Gör ile tam sayfa açılır) */
  how?: ReactNode;
  /** Seviye 3 tam sayfa feature-importance çubukları */
  factors?: XaiFactorBar[];
  sheetTitle?: string;
  aiLabel?: string;
  /** Yetersiz veri kaçış kapağı */
  limitedData?: boolean;
  children?: ReactNode;
}) {
  const [openWhy, setOpenWhy] = useState(false);
  const [openHow, setOpenHow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const badge = BADGE[level];
  const canOpenSheet = (factors != null && factors.length > 0) || how != null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-[var(--tm-r-data)] border border-[var(--tm-mist)] bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {aiLabel}
        </span>
        <span
          className="inline-flex items-center rounded-[var(--tm-r-data)] px-2 py-0.5 text-[10px] font-medium"
          style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}
        >
          {badge.label}
        </span>
        {limitedData && (
          <span className="text-[11px] text-muted-foreground">
            Sınırlı veriye dayanır — manuel kontrol önerilir
          </span>
        )}
      </div>

      {children}

      <div className="flex flex-wrap gap-3 text-[11px]">
        <button
          type="button"
          onClick={() => setOpenWhy((v) => !v)}
          className="font-medium text-[var(--tm-copper)] underline-offset-2 hover:underline"
        >
          {openWhy ? "Gizle" : "Neden bu önerildi?"}
        </button>
        {canOpenSheet && (
          <button
            type="button"
            onClick={() => {
              if (factors != null && factors.length > 0) setSheetOpen(true);
              else setOpenHow((v) => !v);
            }}
            className="font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            {openHow && !(factors != null && factors.length > 0)
              ? "Detayı gizle"
              : "Detayları gör (Nasıl?)"}
          </button>
        )}
      </div>

      {openWhy && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {why}
        </p>
      )}
      {openHow && how != null && !(factors != null && factors.length > 0) && (
        <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card px-3 py-2 text-xs text-foreground">
          {how}
        </div>
      )}

      <XaiExplainSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetTitle}
        subtitle={why}
        factors={factors ?? []}
      >
        {how}
      </XaiExplainSheet>
    </div>
  );
}

export function confidenceFromScore(score: number | null | undefined): AiConfidenceLevel {
  if (score == null || Number.isNaN(score)) return "low";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
