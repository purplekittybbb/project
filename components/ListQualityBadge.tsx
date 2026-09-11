"use client";

/**
 * ListQualityBadge — inline badge for SKU table rows.
 *
 * Uses TrueMargin design tokens from globals.css:
 *   Grade A (≥80): ledger-green background, white text
 *   Grade B (≥60): copper background, white text
 *   Grade C (≥40): mist background, ink text
 *   Grade D (<40):  alert-clay background, white text
 *
 * compact=true  → just the grade letter (A/B/C/D) in a small rounded box
 * compact=false → grade letter + first issue text, truncated at 40 chars
 */

import type { ListQualityScore } from "@/lib/quality/list-score";

export interface ListQualityBadgeProps {
  score: ListQualityScore;
  compact?: boolean;
  onClick?: () => void;
}

const GRADE_STYLES: Record<ListQualityScore["grade"], { bg: string; color: string }> = {
  A: { bg: "var(--tm-ledger-green)", color: "#ffffff" },
  B: { bg: "var(--tm-copper)",       color: "#ffffff" },
  C: { bg: "var(--tm-mist)",         color: "var(--tm-ink)" },
  D: { bg: "var(--tm-alert-clay)",   color: "#ffffff" },
};

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export function ListQualityBadge({ score, compact = true, onClick }: ListQualityBadgeProps) {
  const { bg, color } = GRADE_STYLES[score.grade];
  const firstIssue = score.issues[0];

  const label = compact
    ? score.grade
    : firstIssue
    ? `${score.grade} · ${truncate(firstIssue, 40)}`
    : score.grade;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Liste Kalite Skoru: ${score.total}/100 — ${score.grade} notu\n${score.issues.join("\n") || "Sorun yok"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: compact ? "2px 6px" : "3px 8px",
        borderRadius: "var(--tm-r-ui, 7px)",
        backgroundColor: bg,
        color,
        fontSize: "11px",
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: "0.02em",
        cursor: onClick ? "pointer" : "default",
        border: "none",
        whiteSpace: compact ? "nowrap" : "normal",
        maxWidth: compact ? undefined : "220px",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}
