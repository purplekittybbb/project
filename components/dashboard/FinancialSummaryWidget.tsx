"use client";

/**
 * Financial P&L overview — hero margin, settlement, sparkline, fee waterfall.
 * Uses PDF §4 fin-profit / fin-loss via lib/design/financial-ui.ts.
 */

import { LiveNumber } from "@/components/trust/LiveNumber";
import { NetProfitLedger } from "@/components/NetProfitLedger";
import { SettlementReconciliationPanel } from "@/components/SettlementReconciliationPanel";
import { finLossClass, finSignedClass } from "@/lib/design/financial-ui";
import { fmtCompactMoney } from "@/lib/format/compact";
import { MARKETPLACE_LABELS, type Channel, type SellerView } from "@/lib/engine";
import { fmtPct, fmtPctPlain } from "@/lib/tools/format-tr";

export interface FinancialSummaryWidgetProps {
  view: SellerView;
  marginPercent: number;
  belief: number;
  ptsDiff: string;
  ptsDiffLabel?: string;
  netContribution: number;
  grossRev: number;
  commission: number;
  vat: number;
  shipping: number;
  returns: number;
  payment: number;
  cogs: number;
  adSpendVal: number;
  onAdSpendChange: (v: number) => void;
  currency: string;
  authConfigured: boolean;
  money: (val: number, cur?: string) => string;
  pctStr: (n: number) => string;
  channelLabel: (c: Channel) => string;
}

/** Full-width pazaryeri kâr/zarar strip (combined channel). */
export function MarketplaceMarginStrip({
  view,
  currency,
  pctStr,
}: {
  view: SellerView;
  currency: string;
  pctStr: (n: number) => string;
}) {
  if (view.channel !== "combined" || !view.marketplaceMargins) return null;

  return (
    <div className="mb-16">
      <h3
        className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-6"
        title="Sabit, temsili kur — anlık piyasa kuru değildir. Yalnızca farklı pazaryerlerindeki USD tutarları TRY ile karşılaştırılabilir hale getirmek için kullanılır."
      >
        Pazaryeri bazında · TRY toplamı (USD→TRY, temsili kur @33)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800">
        {view.marketplaceMargins.map((mp) => (
          <div key={mp.marketplace} className="bg-zinc-950 p-4 lg:p-6">
            <div className="text-zinc-500 font-sans text-xs mb-4">
              {MARKETPLACE_LABELS[mp.marketplace]}
            </div>
            <div className={finSignedClass(mp.trueMarginPct, "text-2xl font-mono")}>
              <LiveNumber value={mp.trueMarginPct} format={(n) => pctStr(n)} />
            </div>
            <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">
              Algılanan {pctStr(mp.perceivedMarginPct)}
            </div>
            <div className="text-zinc-500 text-[11px] font-mono mt-3 tabular-nums">
              Ciro {fmtCompactMoney(mp.grossRevenue, mp.currency)}
            </div>
          </div>
        ))}
        <div className="bg-zinc-900/40 p-4 lg:p-6 border-l border-zinc-800">
          <div className="text-zinc-400 font-sans text-xs mb-4">Toplam (TRY karşılığı)</div>
          <div className={finSignedClass(view.trueMarginPct, "text-2xl font-mono")}>
            <LiveNumber value={view.trueMarginPct} format={(n) => pctStr(n)} />
          </div>
          <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">
            Algılanan {pctStr(view.perceivedMarginPct)}
          </div>
          <div className="text-zinc-500 text-[11px] font-mono mt-3 tabular-nums">
            Ciro {fmtCompactMoney(view.waterfall.grossRevenue, currency)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinancialSummaryWidget({
  view,
  marginPercent,
  belief,
  ptsDiff,
  ptsDiffLabel,
  netContribution,
  grossRev,
  commission,
  vat,
  shipping,
  returns,
  payment,
  cogs,
  adSpendVal,
  onAdSpendChange,
  currency,
  authConfigured,
  money,
  pctStr,
  channelLabel,
}: FinancialSummaryWidgetProps) {
  const w = view.waterfall;

  return (
    <div className="w-full lg:w-7/12 flex flex-col">
      <div className="mb-20 lg:mb-24 relative">
        <div className="absolute -left-6 lg:-left-8 top-1 bottom-1 w-px bg-zinc-900" />
        <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-6">
          Gerçek Marj · {channelLabel(view.channel)}
        </h2>
        <div
          className={finSignedClass(
            marginPercent,
            "text-7xl lg:text-[96px] leading-none font-mono tracking-tighter",
          )}
        >
          <LiveNumber
            value={marginPercent}
            format={(n) => fmtPct(n)}
          />
        </div>
        <div className="text-zinc-500 mt-6 lg:mt-8 font-mono text-sm flex items-center gap-4">
          <span>
            Satıcının sandığı <span className="text-zinc-200">{fmtPctPlain(belief)}%</span>
          </span>
          <span className="w-1 h-1 bg-zinc-800 rounded-none" />
          <span className={finLossClass()}>{ptsDiffLabel ?? `${ptsDiff} puan düşük`}</span>
        </div>

        <div className="mt-6 lg:mt-8 flex items-baseline gap-3 border-l-2 border-zinc-800 pl-4">
          <div>
            <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-1">
              Başabaş fiyatı
            </div>
            <div className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-zinc-100 tracking-tight">
              {money(view.breakEvenPrice)}
            </div>
            <div className="text-zinc-600 text-[11px] font-mono mt-1">
              Bu fiyatın altında satmak zarar.
            </div>
          </div>
          <div className="hidden sm:block text-zinc-700 text-[10px] font-mono leading-relaxed max-w-[180px]">
            (COGS + kargo + hizmet) / (1 − komisyon)
          </div>
        </div>

        {(() => {
          const s = view.settlement;
          const hasGap = s.hasGap;
          const dotColor = !s.isRealSettlementData
            ? "bg-zinc-600"
            : hasGap
              ? "fin-dot-loss opacity-60"
              : "fin-dot-profit opacity-60";
          return (
            <div className="mt-5 flex items-start justify-between gap-4 border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">
                    Hakediş Doğrulama
                  </div>
                  {!s.isRealSettlementData && (
                    <span
                      title="Gerçek hakediş dosyası bağlanmadı — bu rakam sadece beklenen tutarı gösterir, gerçek ödeme doğrulaması yapılmadı."
                      className="text-[9px] px-1.5 py-0.5 font-mono uppercase tracking-widest border border-zinc-700 text-zinc-500"
                    >
                      Temsili
                    </span>
                  )}
                </div>
                <div className="font-mono text-sm flex items-baseline gap-3 flex-wrap">
                  <span className="text-zinc-500">Beklenen</span>
                  <span className="tabular-nums text-zinc-200">{money(s.expectedPayout)}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-zinc-500">{s.isRealSettlementData ? "Gerçek" : "Temsili"}</span>
                  <span className="tabular-nums text-zinc-200">{money(s.actualPayout)}</span>
                </div>
                {s.isRealSettlementData ? (
                  <div
                    className={finSignedClass(
                      hasGap ? -1 : 1,
                      "mt-1.5 font-mono text-[12px] font-medium",
                    )}
                  >
                    {hasGap
                      ? `${s.marketplaceLabel} ${money(s.gap)} eksik ödedi (−${fmtPctPlain(s.gapRatePct)}%)`
                      : `${s.marketplaceLabel} tam ödedi ✓`}
                  </div>
                ) : (
                  <div className="mt-1.5 font-mono text-[12px] text-zinc-500 leading-relaxed max-w-sm">
                    {`${s.marketplaceLabel} için henüz gerçek hakediş/ödeme dosyası bağlı değil — gösterilen "Temsili" tutar beklenen tutarla aynı kabul edilmiştir, doğrulanmış bir ödeme farkı değildir.`}
                  </div>
                )}
              </div>
              <div className={`shrink-0 w-1.5 self-stretch rounded-full ${dotColor}`} />
            </div>
          );
        })()}

        <SettlementReconciliationPanel
          marketplace={view.channel}
          marketplaceLabel={view.settlement.marketplaceLabel}
          expectedPayout={view.settlement.expectedPayout}
          currency={view.currency}
          authConfigured={authConfigured}
        />
      </div>

      {view.marginHistory.length >= 2 && (
        <MarginSparkline history={view.marginHistory} />
      )}

      <NetProfitLedger
        grossRevenue={grossRev}
        commission={commission}
        vat={vat}
        shipping={shipping}
        returns={returns}
        adSpend={adSpendVal}
        payment={payment}
        cogs={cogs}
        packaging={w.packaging ?? 0}
        netContribution={netContribution}
        marginPct={marginPercent}
        currency={currency}
        floorPrice={view.breakEvenPrice}
        baseAdSpend={w.adSpendAllocated}
        onAdSpendChange={onAdSpendChange}
      />
    </div>
  );
}

function MarginSparkline({
  history,
}: {
  history: SellerView["marginHistory"];
}) {
  const pts = history;
  const W = 280;
  const H = 80;
  const PAD_X = 8;
  const PAD_Y = 12;
  const allVals = pts.flatMap((p) => [p.trueMarginPct, p.perceivedMarginPct]);
  const minV = Math.min(...allVals) - 2;
  const maxV = Math.max(...allVals) + 2;
  const range = maxV - minV || 1;
  const xOf = (i: number) => PAD_X + (i / (pts.length - 1)) * (W - PAD_X * 2);
  const yOf = (v: number) => PAD_Y + (1 - (v - minV) / range) * (H - PAD_Y * 2);
  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ");
  const zeroY = yOf(0);
  const lastIdx = pts.length - 1;
  const lastTrue = pts[lastIdx].trueMarginPct;
  const lastPerc = pts[lastIdx].perceivedMarginPct;
  const trueColor =
    lastTrue >= 0 ? "var(--fin-profit, #6baa88)" : "var(--fin-loss, #ef6b63)";

  return (
    <div className="mt-0 mb-1 border border-zinc-800/70 bg-zinc-900/20 px-4 pt-3 pb-4">
      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
        Dönemsel Gerçek Marj
      </div>
      <svg width={W} height={H} className="overflow-visible">
        {zeroY >= PAD_Y && zeroY <= H - PAD_Y && (
          <line
            x1={PAD_X}
            y1={zeroY}
            x2={W - PAD_X}
            y2={zeroY}
            stroke="#3f3f46"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        <path
          d={toPath(pts.map((p) => p.perceivedMarginPct))}
          fill="none"
          stroke="#71717a"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d={toPath(pts.map((p) => p.trueMarginPct))}
          fill="none"
          stroke={trueColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <g key={p.period}>
            <circle cx={xOf(i)} cy={yOf(p.trueMarginPct)} r="2.5" fill={trueColor} />
            <text
              x={xOf(i)}
              y={H}
              textAnchor="middle"
              fontSize="9"
              fill="#52525b"
              fontFamily="monospace"
            >
              {p.label}
            </text>
          </g>
        ))}
        <text
          x={xOf(lastIdx) + 6}
          y={yOf(lastTrue) + 4}
          fontSize="9"
          fill={trueColor}
          fontFamily="monospace"
        >
          {fmtPctPlain(lastTrue)}%
        </text>
        <text
          x={xOf(lastIdx) + 6}
          y={yOf(lastPerc) + 4}
          fontSize="9"
          fill="#71717a"
          fontFamily="monospace"
        >
          {fmtPctPlain(lastPerc)}%
        </text>
      </svg>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-[9px] text-zinc-500 font-mono">
          <span className="inline-block w-4 h-px" style={{ background: trueColor }} /> Gerçek
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-zinc-600 font-mono">
          <span className="inline-block w-4 border-t border-dashed border-zinc-600" /> Algılanan
        </span>
      </div>
    </div>
  );
}
