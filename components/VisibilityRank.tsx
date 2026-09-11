"use client";

/**
 * Visibility rank badge + detail panel.
 *
 * Reads the phase-3 model: this user's watch (private) + shared scan (public
 * marketplace rank). Never shows who else is watching.
 */

import type { WatchedVisibility } from "@/lib/domain/visibility";
import {
  formatVisibilityPage,
  formatVisibilityRank,
  formatVisibilityScrapedAt,
} from "@/lib/visibility/display";

const TONE_STYLE: Record<
  ReturnType<typeof formatVisibilityRank>["tone"],
  { color: string; bg: string; border: string }
> = {
  found: {
    color: "var(--tm-ledger-green)",
    bg: "color-mix(in srgb, var(--tm-ledger-green) 12%, var(--tm-paper))",
    border: "color-mix(in srgb, var(--tm-ledger-green) 28%, transparent)",
  },
  missing: {
    color: "var(--tm-alert-clay)",
    bg: "color-mix(in srgb, var(--tm-alert-clay) 10%, var(--tm-paper))",
    border: "color-mix(in srgb, var(--tm-alert-clay) 25%, transparent)",
  },
  pending: {
    color: "var(--tm-ink)",
    bg: "var(--tm-mist, #f4f4f5)",
    border: "color-mix(in srgb, var(--tm-ink) 15%, transparent)",
  },
};

const MARKETPLACE_SHORT: Record<string, string> = {
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
  n11: "N11",
};

export interface VisibilityRankBadgeProps {
  row: WatchedVisibility;
  onClick?: () => void;
}

export function VisibilityRankBadge({ row, onClick }: VisibilityRankBadgeProps) {
  const { label, tone } = formatVisibilityRank(row.scan);
  const style = TONE_STYLE[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      title={row.scan ? `${label} · ${row.watch.keyword}` : "İzleniyor, tarama sonucu henüz yok"}
      aria-label={`${row.watch.sku} görünürlük: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 6px",
        borderRadius: "var(--tm-r-ui, 7px)",
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontSize: "10px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: 600,
        letterSpacing: "0.04em",
        lineHeight: 1.4,
        cursor: onClick ? "pointer" : "default",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export interface VisibilityPanelProps {
  row: WatchedVisibility;
  onClose?: () => void;
}

export function VisibilityPanel({ row, onClose }: VisibilityPanelProps) {
  const { label, tone } = formatVisibilityRank(row.scan);
  const style = TONE_STYLE[tone];
  const marketplace = MARKETPLACE_SHORT[row.watch.marketplace] ?? row.watch.marketplace;

  return (
    <div
      style={{
        border: "1px solid var(--tm-mist, #DCD9D2)",
        borderRadius: "var(--tm-r-data, 3px)",
        padding: "14px 16px",
        backgroundColor: "var(--card, #ffffff)",
        color: "var(--tm-ink, #12181B)",
        fontSize: "13px",
        lineHeight: 1.5,
        maxWidth: "420px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>Arama görünürlüğü</div>
          <div style={{ fontSize: "11px", color: "var(--muted-foreground, #6B6560)" }}>
            {marketplace} · {row.watch.sku}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              color: "var(--muted-foreground, #6B6560)",
              padding: "0 2px",
              lineHeight: 1,
            }}
            aria-label="Kapat"
          >
            ×
          </button>
        )}
      </div>

      <div
        style={{
          display: "inline-flex",
          padding: "3px 8px",
          marginBottom: "10px",
          borderRadius: "var(--tm-r-data, 2px)",
          backgroundColor: style.bg,
          color: style.color,
          border: `1px solid ${style.border}`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: "12px" }}>
        <dt style={{ opacity: 0.5 }}>Kelime</dt>
        <dd style={{ margin: 0 }}>{row.watch.keyword}</dd>
        {row.scan && (
          <>
            <dt style={{ opacity: 0.5 }}>Sayfa</dt>
            <dd style={{ margin: 0 }}>{formatVisibilityPage(row.scan)}</dd>
            <dt style={{ opacity: 0.5 }}>Dizin</dt>
            <dd style={{ margin: 0 }}>{row.scan.isIndexed ? "Dizinde" : "Dizinde değil"}</dd>
            <dt style={{ opacity: 0.5 }}>Son tarama</dt>
            <dd style={{ margin: 0 }}>{formatVisibilityScrapedAt(row.scan.scrapedAt)}</dd>
          </>
        )}
      </dl>

      <p
        style={{
          margin: "12px 0 0",
          fontSize: "11px",
          lineHeight: 1.45,
          opacity: 0.55,
        }}
      >
        Sıra paylaşılan pazaryeri taramasıdır. Kimlerin izlediği görünmez.
      </p>
    </div>
  );
}
