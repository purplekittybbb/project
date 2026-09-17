"use client";

/**
 * Net-Profit Ledger — the "digital muhasebe defteri" display.
 *
 * Design rationale (cursor-design-prompt.md):
 *   §2 — Visual encapsulation: the final net-profit number lives in its own
 *        colour-keyed capsule ("dijital kasa"), separated from the breakdown.
 *   §3 — Breakdown: table/list with tabular-nums, no charts/pies.  Each row
 *        is "− Label: amount", negative items in muted ink, the final number
 *        in the profit/loss colour.  Kuruş hassasiyeti (X,XX TL) preserved.
 *   §4 — Loss alarm: if netContribution < 0, an inline clause replaces the
 *        generic "Negatif marj" badge with a specific, actionable message.
 *   §8 — Motion: smooth numeric transition when adSpend slider changes.
 *        No card-fan fade-ins; one intentional transition only.
 *
 * This component is a "use client" because it owns the ad-spend slider state
 * (interactive re-computation).  All other logic is props-driven.
 */

import { useState, useEffect, useCallback } from "react";

// ── Turkish labels (spec §7: aktif ses, spesifik metin) ──────────────────────
const LABELS: Record<string, string> = {
  commission:  "Komisyon",
  vat:         "Komisyon KDV",
  shipping:    "Kargo",
  returns:     "İade riski",
  adSpend:     "Reklam harcaması",
  payment:     "Ödeme ücreti",
  cogs:        "Ürün maliyeti (COGS)",
  packaging:   "Ambalaj",
};

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtMoney(value: number, currency: string): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return currency === "USD" ? `$${formatted}` : `₺${formatted}`;
}

function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

// ── Component types ──────────────────────────────────────────────────────────

export interface NetProfitLedgerProps {
  grossRevenue:    number;
  commission:      number;
  vat:             number;    // commissionVat (only for vat-excluded marketplaces)
  shipping:        number;
  returns:         number;    // returnRiskCost
  /** Controlled current ad-spend value (may differ from w.adSpendAllocated). */
  adSpend:         number;
  payment:         number;    // paymentFees
  cogs:            number;
  packaging:       number;
  netContribution: number;    // live value (after ad-spend recompute)
  marginPct:       number;    // live value
  currency:        string;
  /** Break-even / floor price from computeBreakEvenPrice, shown in loss alarm. */
  floorPrice?:     number;
  /** Initial (baseline) ad-spend from the waterfall — used as slider default. */
  baseAdSpend:     number;
  /** Called whenever the user drags the ad-spend slider. */
  onAdSpendChange: (value: number) => void;
}

// ── Ledger row ───────────────────────────────────────────────────────────────

function LedgerRow({
  label,
  value,
  grossRevenue,
  currency,
  interactive,
  sliderValue,
  onSliderChange,
}: {
  label: string;
  value: number;
  grossRevenue: number;
  currency: string;
  interactive?: boolean;
  sliderValue?: number;
  onSliderChange?: (v: number) => void;
}) {
  const pct = grossRevenue > 0 ? Math.min(100, (value / grossRevenue) * 100) : 0;
  const displayValue = interactive && sliderValue !== undefined ? sliderValue : value;

  return (
    <div className="group flex items-center gap-3 py-[9px] border-b border-[var(--tm-mist)] last:border-0">
      {/* Label */}
      <div className="w-36 shrink-0 text-[12px] text-[var(--tm-ink)] opacity-60 select-none">
        {label}
      </div>

      {/* Proportional bar — "data-ink ratio" (Tufte §3) */}
      <div className="flex-1 relative h-[1px] bg-[var(--tm-mist)] overflow-visible hidden sm:block">
        {interactive ? (
          /* Interactive slider for ad spend */
          <input
            type="range"
            min={0}
            max={Math.max(grossRevenue, displayValue)}
            step={100}
            value={displayValue}
            onChange={(e) => onSliderChange?.(Number(e.target.value))}
            aria-label="Reklam harcamasını ayarla"
            className="absolute inset-0 w-full h-5 -top-2 cursor-ew-resize opacity-0 peer"
          />
        ) : null}
        <div
          className="absolute left-0 top-0 h-[2px] -translate-y-px bg-[var(--tm-mist)] group-hover:bg-[var(--tm-copper)] transition-colors duration-200"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
        {interactive && (
          <span className="absolute -top-5 right-0 text-[9px] text-[var(--tm-ink)] opacity-40 uppercase tracking-widest peer-focus:opacity-80 transition-opacity hidden lg:block">
            sürükle
          </span>
        )}
      </div>

      {/* Amount — right-aligned, tabular-nums, "kuruş hassasiyeti" preserved */}
      <div
        className={`w-28 shrink-0 text-right text-[13px] tnum select-all tm-num-transition ${
          interactive ? "font-semibold text-[var(--tm-ink)]" : "text-[var(--tm-ink)] opacity-70"
        }`}
      >
        − {fmtMoney(displayValue, currency)}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function NetProfitLedger({
  grossRevenue,
  commission,
  vat,
  shipping,
  returns,
  adSpend,
  payment,
  cogs,
  packaging,
  netContribution,
  marginPct,
  currency,
  floorPrice,
  baseAdSpend,
  onAdSpendChange,
}: NetProfitLedgerProps) {
  // Local ad-spend state mirrors the controlled prop so the slider stays
  // responsive while the parent re-computes (live.netContribution propagates
  // back through onAdSpendChange → recomputeMargin → marginPct/netContribution).
  const [localAdSpend, setLocalAdSpend] = useState(baseAdSpend);

  useEffect(() => {
    setLocalAdSpend(adSpend);
  }, [adSpend]);

  const handleAdSpend = useCallback(
    (v: number) => {
      setLocalAdSpend(v);
      onAdSpendChange(v);
    },
    [onAdSpendChange],
  );

  const isLoss = netContribution < 0;

  type Row = { key: string; value: number; interactive?: true };
  const rows: Row[] = [
    { key: "commission",  value: commission },
    { key: "vat",         value: vat },
    { key: "shipping",    value: shipping },
    { key: "returns",     value: returns },
    { key: "adSpend",     value: localAdSpend, interactive: true as const },
    { key: "payment",     value: payment },
    { key: "cogs",        value: cogs },
    { key: "packaging",   value: packaging },
  ].filter((r) => r.value > 0 || r.interactive); // hide zero-value rows (except slider)

  return (
    <div
      className="bg-[var(--tm-paper)] border border-[var(--tm-mist)] p-6"
      style={{ borderRadius: "var(--tm-r-data)" }}
    >
      {/* ── Gross revenue header ── */}
      <div className="flex justify-between items-baseline pb-3 mb-1 border-b-2 border-[var(--tm-ink)] border-opacity-10">
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--tm-ink)] opacity-50 select-none">
          Brüt Ciro
        </span>
        <span className="text-[15px] font-semibold tnum text-[var(--tm-ink)]">
          {fmtMoney(grossRevenue, currency)}
        </span>
      </div>

      {/* ── Deduction rows ── */}
      <div className="mt-1">
        {rows.map((r) => (
          <LedgerRow
            key={r.key}
            label={LABELS[r.key] ?? r.key}
            value={r.key === "adSpend" ? localAdSpend : r.value}
            grossRevenue={grossRevenue}
            currency={currency}
            interactive={r.interactive}
            sliderValue={r.key === "adSpend" ? localAdSpend : undefined}
            onSliderChange={r.key === "adSpend" ? handleAdSpend : undefined}
          />
        ))}
      </div>

      {/* ── Net-profit capsule — spec §2 "dijital kasa" ── */}
      <div
        className={`mt-5 px-5 py-4 ${isLoss ? "tm-capsule-loss" : "tm-capsule-profit"}`}
        role="region"
        aria-label={`Net kâr: ${fmtMoney(netContribution, currency)}`}
      >
        <div className="flex justify-between items-center">
          <span
            className="text-[11px] uppercase tracking-[0.18em] select-none"
            style={{ color: isLoss ? "var(--tm-alert-clay)" : "var(--tm-ledger-green)" }}
          >
            Net Kâr
          </span>
          <span
            className="text-[11px] tnum select-none"
            style={{ color: isLoss ? "var(--tm-alert-clay)" : "var(--tm-ledger-green)" }}
          >
            {fmtPct(marginPct)} gerçek marj
          </span>
        </div>
        <div
          className="mt-1 text-[22px] font-bold tnum tm-num-transition leading-none"
          style={{ color: isLoss ? "var(--tm-alert-clay)" : "var(--tm-ledger-green)" }}
        >
          {isLoss ? "− " : ""}{fmtMoney(Math.abs(netContribution), currency)}
        </div>

        {/* Loss alarm — spec §4: spesifik, aksiyon odaklı, Türkçe */}
        {isLoss && floorPrice !== undefined && floorPrice > 0 && (
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--tm-alert-clay)" }}>
            Bu fiyattan satmak zarar ettirir.{" "}
            <strong>{fmtMoney(Math.abs(netContribution), currency)}</strong> kayıp var.{" "}
            Zarar etmemek için en az{" "}
            <strong className="tnum">{fmtMoney(floorPrice, currency)}</strong>&apos;ye satmalısınız.
          </p>
        )}
      </div>

      {/* Honest disclosure: commission is a representative per-category rate,
          not each seller's exact contract rate (which varies by category and
          negotiation). Kept explicit so the headline "net kâr" is never taken
          as exact when the commission input is approximate. */}
      {commission > 0 && (
        <p
          className="mt-3 text-[10px] leading-relaxed select-none"
          style={{ color: "var(--tm-ink)", opacity: 0.4 }}
          title="Komisyon, pazaryeri kategori oranlarına göre temsilî hesaplanır; kendi sözleşme oranınız farklı olabilir. Kesin oran için satıcı panelinizdeki hakediş/komisyon kalemine bakın."
        >
          Komisyon temsilî kategori oranıyla hesaplanır — kendi sözleşme oranınız farklı olabilir.
        </p>
      )}
    </div>
  );
}
