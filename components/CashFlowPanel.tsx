"use client";

/**
 * Nakit Akışı — Cash-flow projection panel.
 *
 * Seed transaction verilerinden (saleDate + pazaryeri teslim/ödeme gecikme modeli)
 * tahmini hakediş takvimini üretir. Alınan, bekleyen ve yaklaşan ödemeleri
 * sade, tabular bir görünümde gösterir.
 */

import { useMemo } from "react";
import { getCashFlowProjection, type CashFlowEntry, type Channel } from "@/lib/engine";

// ─── helpers ──────────────────────────────────────────────────────────────────

function money(v: number, currency: string) {
  const sym = currency === "USD" ? "$" : "₺";
  return `${sym}${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  received: { label: "Alındı",   cls: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20" },
  pending:  { label: "Bekliyor", cls: "text-zinc-400   border-zinc-700       bg-zinc-900/30"     },
  overdue:  { label: "Yakın",    cls: "text-amber-400  border-amber-800/50   bg-amber-950/20"    },
} as const;

function StatusBadge({ status }: { status: CashFlowEntry["status"] }) {
  const { label, cls } = STATUS_CFG[status];
  return (
    <span className={`text-[9px] font-mono tracking-widest px-1.5 py-0.5 border ${cls}`}>
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
  const received  = entries.filter((e) => e.status === "received");
  const pending   = entries.filter((e) => e.status !== "received");
  const totalRec  = received.reduce((s, e) => s + (e.actualPayout ?? 0), 0);
  const totalPend = pending.reduce((s, e) => s + e.expectedPayout, 0);
  const totalGap  = received.reduce((s, e) => s + (e.gap ?? 0), 0);
  const next      = pending.sort((a, b) => a.daysFromToday - b.daysFromToday)[0];
  // Same tenant → same value on every entry; no real settlement file means the
  // "fark" figure is a representative model, not a verified reconciliation.
  const isReal = entries[0]?.isRealSettlementData ?? false;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800 mb-8">
      {[
        { label: isReal ? "Alınan Toplam" : "Alınan Toplam (Temsili)", val: money(totalRec, currency),  sub: `${received.length} hakediş`,       dim: false },
        { label: "Beklenen Toplam", val: money(totalPend, currency),  sub: `${pending.length} bekleyen`,       dim: true  },
        { label: isReal ? "Toplam Fark" : "Toplam Fark (Temsili)",
                                    val: !isReal ? "—" : totalGap > 0 ? `−${money(totalGap, currency)}` : "—",
                                    sub: !isReal ? "gerçek hakediş dosyası bağlı değil" : totalGap > 0 ? "eksik ödeme" : "tam ödendi",
                                    err: isReal && totalGap > 0 },
        { label: "Sonraki Ödeme",
          val: next ? next.dateLabel : "—",
          sub: next ? `${next.daysFromToday} gün sonra` : "tümü alındı",
          dim: !next },
      ].map(({ label, val, sub, dim, err }) => (
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
  const hasGap = (e.gap ?? 0) > 0;
  const isReal = e.isRealSettlementData;

  return (
    <div className="flex items-center w-full py-3 border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors font-mono text-sm gap-2">
      {/* Date */}
      <div className="w-[80px] shrink-0">
        <div className="text-zinc-200 tabular-nums">{e.dateLabel}</div>
        <div className="text-zinc-700 text-[10px]">
          {e.status === "received"
            ? `${Math.abs(e.daysFromToday)}g önce`
            : `${e.daysFromToday}g sonra`}
        </div>
      </div>

      {/* Marketplace */}
      <div className="w-[110px] shrink-0 text-zinc-500 text-[11px] truncate">{e.marketplace}</div>

      {/* Beklenen */}
      <div className="flex-1 text-right">
        <div className="text-zinc-400 tabular-nums">{money(e.expectedPayout, e.currency)}</div>
        <div className="text-zinc-700 text-[9px]">{e.transactionCount} işlem</div>
      </div>

      {/* Gerçek / Temsili / Bekliyor */}
      <div className="w-[110px] text-right shrink-0">
        {e.actualPayout !== null ? (
          <span
            className={`tabular-nums ${!isReal ? "text-zinc-400" : hasGap ? "text-red-400" : "text-emerald-400"}`}
            title={isReal ? undefined : "Gerçek hakediş dosyası yok — beklenen tutarla aynı kabul edilmiştir."}
          >
            {money(e.actualPayout, e.currency)}
            {!isReal && <sup className="text-zinc-600 text-[9px] ml-0.5">T</sup>}
          </span>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>

      {/* Fark */}
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
  const entries = useMemo(
    () => getCashFlowProjection(tenantId, channel),
    [tenantId, channel]
  );

  if (entries.length === 0) {
    return (
      <div className="text-zinc-700 font-mono text-sm py-20 text-center">
        Bu kanal için işlem bulunamadı.
      </div>
    );
  }

  const isReal = entries[0]?.isRealSettlementData ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-1 border-l border-zinc-800 pl-4">
          Nakit Akışı
        </h2>
        <p className="text-zinc-700 text-[11px] font-mono pl-4 border-l border-transparent">
          Satış tarihinden tahmini banka kredisine — pazaryeri teslim + ödeme döngüsü modeli.
        </p>
      </div>

      {/* Summary cards */}
      <Summary entries={entries} currency={currency} />

      {/* Table */}
      <div className="border border-zinc-800">
        {/* Column headers */}
        <div className="flex items-center w-full px-4 py-2 border-b border-zinc-800 bg-zinc-900/40 font-sans text-[10px] text-zinc-600 uppercase tracking-[0.12em] gap-2">
          <div className="w-[80px] shrink-0">Tarih</div>
          <div className="w-[110px] shrink-0">Pazaryeri</div>
          <div className="flex-1 text-right">Beklenen</div>
          <div className="w-[110px] text-right shrink-0">{isReal ? "Gerçek" : "Temsili (T)"}</div>
          <div className="w-[90px]  text-right shrink-0">Fark</div>
          <div className="w-[70px]  text-right shrink-0">Durum</div>
        </div>

        <div className="px-4 divide-y divide-transparent">
          {entries.map((e) => (
            <Row key={`${e.settlementDate}-${e.marketplace}`} e={e} />
          ))}
        </div>
      </div>

      {/* Footnote */}
      <div className="border-t border-zinc-900 pt-4 font-mono text-[10px] text-zinc-700 space-y-1">
        <div>
          Gecikme modeli: Trendyol 17g · Amazon US 21g · Hepsiburada 15g (teslimat + ödeme döngüsü).
        </div>
        {isReal ? (
          <div>
            Gerçek tutar, hakediş doğrulama fark oranı uygulanarak hesaplanmıştır.
            Gerçek banka ekstresiyle karşılaştırınız.
          </div>
        ) : (
          <div className="text-amber-500/80">
            (T) Temsili: gerçek hakediş/ödeme dosyası henüz bağlı değil — &quot;Temsili&quot; sütunu beklenen
            tutarla aynı kabul edilmiştir, doğrulanmış bir banka mutabakatı değildir.
          </div>
        )}
      </div>
    </div>
  );
}
