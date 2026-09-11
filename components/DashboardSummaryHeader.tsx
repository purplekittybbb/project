"use client";

/**
 * DashboardSummaryHeader — spec §6: 3-second overview (3-30-300 hero).
 *
 * 3-second: the user lands and immediately sees ONE number: how many SKUs
 * are losing money (or a green "all profitable" confirmation).
 *
 * Design tokens used: --tm-ink, --tm-paper, --tm-ledger-green, --tm-alert-clay, --tm-mist.
 * No flashing, no animations (spec §4, §8). Actionable text only (spec §7).
 */

import type { SkuMargin } from "@/lib/domain/margin-engine";

export interface DashboardSummaryHeaderProps {
  skus: SkuMargin[];
  currency: string;
}

function fmtCount(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

function fmtMoney(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return currency === "USD" ? `$${formatted}` : `₺${formatted}`;
}

export function DashboardSummaryHeader({ skus, currency }: DashboardSummaryHeaderProps) {
  const lossSkus = skus.filter((s) => s.trueMarginPct < 0);
  const totalLossMarginSum = lossSkus.reduce(
    (sum, s) => sum + Math.abs(s.trueMarginPct),
    0
  );
  const allProfitable = lossSkus.length === 0;

  if (allProfitable) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-4 mb-8"
        style={{
          background: "color-mix(in srgb, var(--tm-ledger-green) 8%, var(--tm-paper))",
          border: "1px solid color-mix(in srgb, var(--tm-ledger-green) 25%, transparent)",
          borderRadius: "var(--tm-r-data, 2px)",
        }}
        role="status"
        aria-label="Tüm ürünler kârda"
      >
        {/* Green dot */}
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: "var(--tm-ledger-green)" }}
          aria-hidden="true"
        />
        <span
          className="text-[15px] font-semibold"
          style={{ color: "var(--tm-ledger-green)" }}
        >
          Tüm ürünler kârda
        </span>
        <span
          className="text-[13px] ml-1"
          style={{ color: "var(--tm-ink)", opacity: 0.5 }}
        >
          — {fmtCount(skus.length)} aktif ürün analiz edildi.
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-8 px-5 py-4 mb-8"
      style={{
        background: "color-mix(in srgb, var(--tm-alert-clay) 6%, var(--tm-paper))",
        border: "1px solid color-mix(in srgb, var(--tm-alert-clay) 20%, transparent)",
        borderRadius: "var(--tm-r-data, 2px)",
      }}
      role="alert"
      aria-live="polite"
    >
      {/* Primary big number */}
      <div className="flex items-center gap-3">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: "var(--tm-alert-clay)" }}
          aria-hidden="true"
        />
        <div>
          <span
            className="text-[28px] sm:text-[34px] leading-none font-mono tabular-nums font-semibold tracking-tight"
            style={{ color: "var(--tm-alert-clay)" }}
          >
            {fmtCount(lossSkus.length)}
          </span>
          <span
            className="text-[15px] font-sans ml-2"
            style={{ color: "var(--tm-alert-clay)" }}
          >
            ürün zarar ediyor
          </span>
        </div>
      </div>

      {/* Secondary: total risk proxy (sum of |trueMarginPct| across loss skus) */}
      <div
        className="flex items-baseline gap-2 pl-5 sm:pl-0 border-l-0 sm:border-l"
        style={{ borderColor: "color-mix(in srgb, var(--tm-alert-clay) 20%, transparent)" }}
      >
        <span
          className="text-[11px] uppercase tracking-[0.15em] font-sans"
          style={{ color: "var(--tm-ink)", opacity: 0.45 }}
        >
          Toplam risk endeksi
        </span>
        <span
          className="text-[20px] font-mono tabular-nums font-medium"
          style={{ color: "var(--tm-ink)", opacity: 0.75 }}
        >
          {totalLossMarginSum.toFixed(1)} puan
        </span>
      </div>

      {/* Tertiary: actionable hint */}
      <div
        className="pl-5 sm:pl-0 text-[12px] font-sans"
        style={{ color: "var(--tm-ink)", opacity: 0.45 }}
      >
        Her ürünün satırına tıklayarak güvenli fiyatı görebilirsiniz.
      </div>
    </div>
  );
}
