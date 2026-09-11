"use client";

/**
 * ListQualityPanel — expandable product listing quality detail panel.
 *
 * Shows:
 *  - 5 breakdown dimensions as horizontal bars (scaled to their max)
 *  - Issues as a bulleted list (Turkish)
 *  - A warning when scrapingDataMissing is true
 */

import type { ListQualityScore } from "@/lib/quality/list-score";

export interface ListQualityPanelProps {
  sku: string;
  score: ListQualityScore;
  onClose?: () => void;
}

interface DimensionConfig {
  key: keyof ListQualityScore["breakdown"];
  label: string;
  max: number;
}

const DIMENSIONS: DimensionConfig[] = [
  { key: "titleLength",    label: "Başlık Uzunluğu",    max: 30 },
  { key: "keywordQuality", label: "Anahtar Kelime",      max: 20 },
  { key: "categoryDepth",  label: "Kategori Derinliği",  max: 20 },
  { key: "salesHealth",    label: "Satış Sağlığı",       max: 15 },
  { key: "imageCount",     label: "Görsel Puanı",        max: 15 },
];

const GRADE_COLOR: Record<ListQualityScore["grade"], string> = {
  A: "var(--tm-ledger-green)",
  B: "var(--tm-copper)",
  C: "#8a8278",
  D: "var(--tm-alert-clay)",
};

export function ListQualityPanel({ sku, score, onClose }: ListQualityPanelProps) {
  const gradeColor = GRADE_COLOR[score.grade];

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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontWeight: 700, fontSize: "15px" }}>Liste Kalitesi</span>
          <span style={{ fontSize: "11px", color: "var(--muted-foreground, #6B6560)" }}>{sku}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: "20px",
              color: gradeColor,
            }}
          >
            {score.grade}
          </span>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground, #6B6560)" }}>
            {score.total}/100
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                marginLeft: "8px",
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
      </div>

      {/* Breakdown bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "12px" }}>
        {DIMENSIONS.map(({ key, label, max }) => {
          const value = score.breakdown[key];
          const pct = max > 0 ? Math.round((value / max) * 100) : 0;
          const barColor = pct >= 80 ? "var(--tm-ledger-green)" : pct >= 50 ? "var(--tm-copper)" : "var(--tm-alert-clay)";

          return (
            <div key={key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontSize: "12px" }}>{label}</span>
                <span style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                  {value}/{max}
                </span>
              </div>
              <div
                style={{
                  height: "5px",
                  backgroundColor: "var(--tm-mist, #DCD9D2)",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    backgroundColor: barColor,
                    borderRadius: "2px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Scraping data missing warning */}
      {score.scrapingDataMissing && (
        <div
          style={{
            padding: "7px 10px",
            borderRadius: "var(--tm-r-data, 3px)",
            backgroundColor: "#FFF8F0",
            border: "1px solid var(--tm-copper, #9C6B3E)",
            color: "var(--tm-copper, #9C6B3E)",
            fontSize: "12px",
            marginBottom: "10px",
          }}
        >
          ⚠ Görsel sayısı doğrulanamadı — görsel verisi için tarama gerekiyor
        </div>
      )}

      {/* Issues */}
      {score.issues.length > 0 ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: "12px", marginBottom: "5px", color: "var(--muted-foreground, #6B6560)" }}>
            İyileştirme önerileri
          </div>
          <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {score.issues.map((issue, i) => (
              <li key={i} style={{ fontSize: "12px" }}>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--tm-ledger-green, #1F4D3A)" }}>
          ✓ Belirgin sorun bulunamadı
        </div>
      )}
    </div>
  );
}
