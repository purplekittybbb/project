"use client";

/**
 * Cash Flow — projection panel.
 *
 * Derives an estimated settlement calendar from seed transaction data
 * (saleDate + marketplace delivery/payment delay model). Shows received,
 * pending, and upcoming payments in a simple tabular view.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getCashFlowProjection, type CashFlowEntry, type Channel } from "@/lib/engine";

// ─── helpers ──────────────────────────────────────────────────────────────────

function money(v: number, currency: string) {
  const sym = currency === "USD" ? "$" : "₺";
  return `${sym}${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CLS = {
  received: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
  pending: "text-zinc-400   border-zinc-700       bg-zinc-900/30",
  overdue: "text-amber-400  border-amber-800/50   bg-amber-950/20",
} as const;

function StatusBadge({ status }: { status: CashFlowEntry["status"] }) {
  const { t } = useTranslation();
  const label =
    status === "received"
      ? t("cashFlow.statusReceived")
      : status === "pending"
        ? t("cashFlow.statusPending")
        : t("cashFlow.statusOverdue");
  return (
    <span className={`text-[9px] font-mono tracking-widest px-1.5 py-0.5 border ${STATUS_CLS[status]}`}>
      {label}
    </span>
  );
}

// ─── Summary row ─────────────────────────────────────────────────────────────

interface SummaryProps {
  entries: CashFlowEntry[];
  currency: string;
}

function Summary({ entries, currency }: SummaryProps) {
  const { t } = useTranslation();
  const received = entries.filter((e) => e.status === "received");
  const pending = entries.filter((e) => e.status !== "received");
  const totalRec = received.reduce((s, e) => s + (e.actualPayout ?? 0), 0);
  const totalPend = pending.reduce((s, e) => s + e.expectedPayout, 0);
  const totalGap = received.reduce((s, e) => s + (e.gap ?? 0), 0);
  const next = pending.sort((a, b) => a.daysFromToday - b.daysFromToday)[0];
  // Same tenant → same value on every entry; no real settlement file means the
  // gap figure is a representative model, not a verified reconciliation.
  const isReal = entries[0]?.isRealSettlementData ?? false;

  const cards = [
    {
      label: isReal ? t("cashFlow.receivedTotal") : t("cashFlow.receivedTotalRepresentative"),
      val: money(totalRec, currency),
      sub: t("cashFlow.settlements", { count: received.length }),
      dim: false,
    },
    {
      label: t("cashFlow.expectedTotal"),
      val: money(totalPend, currency),
      sub: t("cashFlow.pending", { count: pending.length }),
      dim: true,
    },
    {
      label: isReal ? t("cashFlow.totalGap") : t("cashFlow.totalGapRepresentative"),
      val: !isReal ? "—" : totalGap > 0 ? `−${money(totalGap, currency)}` : "—",
      sub: !isReal ? t("cashFlow.noRealSettlementFile") : totalGap > 0 ? t("cashFlow.underpaid") : t("cashFlow.paidInFull"),
      err: isReal && totalGap > 0,
    },
    {
      label: t("cashFlow.nextPayment"),
      val: next ? next.dateLabel : "—",
      sub: next ? t("cashFlow.daysLater", { days: next.daysFromToday }) : t("cashFlow.allReceived"),
      dim: !next,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800 mb-8">
      {cards.map(({ label, val, sub, dim, err }) => (
        <div key={label} className="bg-zinc-950 p-4 lg:p-5">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.15em] font-sans mb-2">{label}</div>
          <div className={`font-mono tabular-nums text-lg font-semibold ${err ? "text-red-400" : dim ? "text-zinc-500" : "text-zinc-100"}`}>
            {val}
          </div>
          <div className="text-zinc-700 text-[10px] font-mono mt-1">{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function Row({ e }: { e: CashFlowEntry }) {
  const { t } = useTranslation();
  const hasGap = (e.gap ?? 0) > 0;
  const isReal = e.isRealSettlementData;

  return (
    <div className="flex items-center w-full py-3 border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors font-mono text-sm gap-2">
      {/* Date */}
      <div className="w-[80px] shrink-0">
        <div className="text-zinc-200 tabular-nums">{e.dateLabel}</div>
        <div className="text-zinc-700 text-[10px]">
          {e.status === "received"
            ? t("cashFlow.daysAgo", { days: Math.abs(e.daysFromToday) })
            : t("cashFlow.daysFromNow", { days: e.daysFromToday })}
        </div>
      </div>

      {/* Marketplace */}
      <div className="w-[110px] shrink-0 text-zinc-500 text-[11px] truncate">{e.marketplace}</div>

      {/* Expected */}
      <div className="flex-1 text-right">
        <div className="text-zinc-400 tabular-nums">{money(e.expectedPayout, e.currency)}</div>
        <div className="text-zinc-700 text-[9px]">{t("cashFlow.transactionCount", { count: e.transactionCount })}</div>
      </div>

      {/* Actual / Representative / Pending */}
      <div className="w-[110px] text-right shrink-0">
        {e.actualPayout !== null ? (
          <span
            className={`tabular-nums ${!isReal ? "text-zinc-400" : hasGap ? "text-red-400" : "text-emerald-400"}`}
            title={isReal ? undefined : t("cashFlow.noRealSettlementTitle") ?? undefined}
          >
            {money(e.actualPayout, e.currency)}
            {!isReal && <sup className="text-zinc-600 text-[9px] ml-0.5">R</sup>}
          </span>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>

      {/* Gap */}
      <div className="w-[90px] text-right shrink-0">
        {!isReal ? (
          <span className="text-zinc-800">—</span>
        ) : e.gap !== null ? (
          e.gap > 0 ? (
            <span className="text-red-500 tabular-nums">−{money(e.gap, e.currency)}</span>
          ) : (
            <span className="text-zinc-700">—</span>
          )
        ) : (
          <span className="text-zinc-800">—</span>
        )}
      </div>

      {/* Status */}
      <div className="w-[70px] text-right shrink-0">
        <StatusBadge status={e.status} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  tenantId: string;
  channel: Channel;
  currency: string;
}

export function CashFlowPanel({ tenantId, channel, currency }: Props) {
  const { t } = useTranslation();
  const entries = useMemo(
    () => getCashFlowProjection(tenantId, channel),
    [tenantId, channel]
  );

  if (entries.length === 0) {
    return (
      <div className="text-zinc-700 font-mono text-sm py-20 text-center">
        {t("cashFlow.noTransactions")}
      </div>
    );
  }

  const isReal = entries[0]?.isRealSettlementData ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-1 border-l border-zinc-800 pl-4">
          {t("cashFlow.title")}
        </h2>
        <p className="text-zinc-700 text-[11px] font-mono pl-4 border-l border-transparent">
          {t("cashFlow.subtitle")}
        </p>
      </div>

      {/* Summary cards */}
      <Summary entries={entries} currency={currency} />

      {/* Table */}
      <div className="border border-zinc-800">
        {/* Column headers */}
        <div className="flex items-center w-full px-4 py-2 border-b border-zinc-800 bg-zinc-900/40 font-sans text-[10px] text-zinc-600 uppercase tracking-[0.12em] gap-2">
          <div className="w-[80px] shrink-0">{t("cashFlow.date")}</div>
          <div className="w-[110px] shrink-0">{t("cashFlow.marketplace")}</div>
          <div className="flex-1 text-right">{t("cashFlow.expected")}</div>
          <div className="w-[110px] text-right shrink-0">{isReal ? t("cashFlow.actual") : t("cashFlow.representativeShort")}</div>
          <div className="w-[90px]  text-right shrink-0">{t("cashFlow.gap")}</div>
          <div className="w-[70px]  text-right shrink-0">{t("cashFlow.statusCol")}</div>
        </div>

        <div className="px-4 divide-y divide-transparent">
          {entries.map((e) => (
            <Row key={`${e.settlementDate}-${e.marketplace}`} e={e} />
          ))}
        </div>
      </div>

      {/* Footnote */}
      <div className="border-t border-zinc-900 pt-4 font-mono text-[10px] text-zinc-700 space-y-1">
        <div>{t("cashFlow.delayModel")}</div>
        {isReal ? (
          <div>{t("cashFlow.realFootnote")}</div>
        ) : (
          <div className="text-amber-500/80">{t("cashFlow.representativeFootnote")}</div>
        )}
      </div>
    </div>
  );
}
