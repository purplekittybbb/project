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
  // Same figure as LossAlarmBanner further down the page (sum of |netContribution|
  // across loss SKUs, in money). This used to sum trueMarginPct (percentage points)
  // and label it "puan" — so a seller with exactly one losing product saw "1 ürün
  // zarar ediyor" twice on the same page with two different "total risk" numbers in
  // two different units (e.g. "9.6 puan" here vs. "₺48.760,00" below), which read as
  // contradictory. Both widgets now report the same money amount.
  const totalLossMoney = lossSkus.reduce(
    (sum, s) => sum + Math.abs(s.netContribution),
    0
  );
  const allProfitable = lossSkus.length === 0;
  const hasNoData = skus.length === 0;

  // A brand-new user with zero connected/analyzed SKUs is a different state
  // than "we checked every product and none are losing money" — showing the
  // same celebratory green banner for both was misleading (it can't tell
  // "no losses because everything's fine" from "no losses because there's
  // nothing here yet"). Neutral state, no green, no false confidence.
  if (hasNoData) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-4 mb-8"
        style={{
          background: "var(--tm-paper)",
          border: "1px dashed color-mix(in srgb, var(--tm-ink) 20%, transparent)",
          borderRadius: "var(--tm-r-data, 2px)",
        }}
        role="status"
        aria-label="Henüz analiz edilecek ürün yok"
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: "color-mix(in srgb, var(--tm-ink) 35%, transparent)" }}
          aria-hidden="true"
        />
        <span
          className="text-[15px] font-semibold"
          style={{ color: "var(--tm-ink)", opacity: 0.7 }}
        >
          Henüz analiz edilecek ürün yok
        </span>
        <span
          className="text-[13px] ml-1"
          style={{ color: "var(--tm-ink)", opacity: 0.5 }}
        >
          — mağazanızı bağladığınızda kâr durumu burada görünecek.
        </span>
      </div>
    );
  }

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

      {/* Secondary: total risk in money (sum of |netContribution| across loss skus) —
          same figure LossAlarmBanner shows further down, kept in sync so the two
          "X ürün zarar ediyor" summaries on this page never disagree. */}
      <div
        className="flex items-baseline gap-2 pl-5 sm:pl-0 border-l-0 sm:border-l"
        style={{ borderColor: "color-mix(in srgb, var(--tm-alert-clay) 20%, transparent)" }}
      >
        <span
          className="text-[11px] uppercase tracking-[0.15em] font-sans"
          style={{ color: "var(--tm-ink)", opacity: 0.45 }}
        >
          Toplam risk
        </span>
        <span
          className="text-[20px] font-mono tabular-nums font-medium"
          style={{ color: "var(--tm-ink)", opacity: 0.75 }}
        >
          {fmtMoney(totalLossMoney, currency)}
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
