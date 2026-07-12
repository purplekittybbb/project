"use client";

/**
 * SKU Profitability Heatmap — powered by perSkuMargins() from the engine.
 *
 * Accepts real SkuMargin[] from lib/engine (via view.skus).
 * No mock data. Sorting, bucket coloring, and risk flags are all derived
 * from the engine's own aggregateTrueMargin / aggregatePerceivedMargin results.
 */

import { useMemo, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Package, TrendingDown, TrendingUp, X,
} from "lucide-react";
import {
  getSkuBreakEven,
  getSkuFinancingEstimate,
  simulateSkuAdSpend,
  type Channel,
  type SkuMargin,
} from "@/lib/engine";

// ─── Bucket logic ─────────────────────────────────────────────────────────────

type BucketKey = "cash-cow" | "profitable" | "bleeding" | "silent-loser";

interface MarginBucket {
  key: BucketKey;
  label: string;
  chipClass: string;
  cellClass: string;
  dotClass: string;
  actionLabel: string;
  actionClass: string;
  Icon: typeof TrendingUp;
}

function marginBucket(marginPct: number): MarginBucket {
  if (marginPct > 20)
    return {
      key: "cash-cow",
      label: "Cash Cow",
      chipClass: "bg-emerald-100 text-emerald-800",
      cellClass: "bg-emerald-100 text-emerald-800",
      dotClass: "bg-emerald-500",
      actionLabel: "Fund Inventory",
      actionClass: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500",
      Icon: TrendingUp,
    };
  if (marginPct >= 0)
    return {
      key: "profitable",
      label: "Profitable",
      chipClass: "bg-green-50 text-green-700",
      cellClass: "bg-green-50 text-green-700",
      dotClass: "bg-green-500",
      actionLabel: "Scale Ads",
      actionClass: "border border-green-300 text-green-700 hover:bg-green-100 focus-visible:ring-green-500",
      Icon: TrendingUp,
    };
  if (marginPct >= -5)
    return {
      key: "bleeding",
      label: "Bleeding",
      chipClass: "bg-orange-50 text-orange-700",
      cellClass: "bg-orange-50 text-orange-700",
      dotClass: "bg-orange-500",
      actionLabel: "Adjust Price",
      actionClass: "border border-orange-300 text-orange-700 hover:bg-orange-100 focus-visible:ring-orange-500",
      Icon: AlertCircle,
    };
  return {
    key: "silent-loser",
    label: "Silent Loser",
    chipClass: "bg-red-100 text-red-800",
    cellClass: "bg-red-100 text-red-800",
    dotClass: "bg-red-500",
    actionLabel: "Stop Ads",
    actionClass: "border border-red-300 text-red-700 hover:bg-red-100 focus-visible:ring-red-500",
    Icon: TrendingDown,
  };
}

const BUCKET_ORDER: Record<BucketKey, number> = {
  "silent-loser": 0, bleeding: 1, profitable: 2, "cash-cow": 3,
};

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function money(v: number, currency: string) {
  const sym = currency === "USD" ? "$" : "₺";
  return `${sym}${Math.abs(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

/** Every panel below computes ONE real number from an existing engine
 *  function (getSkuFinancingEstimate / simulateSkuAdSpend / getSkuBreakEven) —
 *  scoped to this one SKU's own transactions. None of them submit anything;
 *  the disclaimer at the bottom of each panel says so explicitly. */
function SimNote() {
  return (
    <p className="mt-3 text-[10px] text-slate-400">
      Bu bir simülasyon/öneridir — otomatik bir işlem yapılmaz.
    </p>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">{title}</h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
        >
          <X size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}

function FundInventoryPanel({
  row, tenantId, channel, onClose, onGoToFinancing,
}: {
  row: SkuMargin; tenantId: string; channel: Channel; onClose: () => void; onGoToFinancing?: () => void;
}) {
  const estimate = useMemo(() => getSkuFinancingEstimate(tenantId, channel, row.sku), [tenantId, channel, row.sku]);
  return (
    <PanelShell title={`Fund Inventory · ${row.sku}`} onClose={onClose}>
      {!estimate ? (
        <p className="text-xs text-slate-500">Bu SKU için finansman tahmini hesaplanamadı.</p>
      ) : (
        <>
          <p className="text-xs text-slate-600">
            Bu SKU'nun aylık katkı payı ({money(estimate.monthlyContribution, estimate.currency)}) tek başına
            underwriting motorundan geçirildiğinde:
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
              {money(estimate.approvedLimit, estimate.currency)}
            </span>
            <span className="text-[11px] text-slate-500">bu ürüne özel ek stok finansmanı tahmini</span>
          </div>
          {onGoToFinancing && (
            <button
              type="button"
              onClick={onGoToFinancing}
              className="mt-4 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Financing sekmesine git
            </button>
          )}
          <SimNote />
        </>
      )}
    </PanelShell>
  );
}

function ScaleAdsPanel({
  row, tenantId, channel, onClose,
}: {
  row: SkuMargin; tenantId: string; channel: Channel; onClose: () => void;
}) {
  const [boostPct, setBoostPct] = useState(50);
  const base = useMemo(() => simulateSkuAdSpend(tenantId, channel, row.sku, 0), [tenantId, channel, row.sku]);
  const scenario = useMemo(() => {
    const currentAd = base?.currentAdSpend ?? 0;
    const target = currentAd > 0 ? currentAd * (1 + boostPct / 100) : boostPct;
    return simulateSkuAdSpend(tenantId, channel, row.sku, target);
  }, [tenantId, channel, row.sku, boostPct, base]);

  return (
    <PanelShell title={`Scale Ads · ${row.sku}`} onClose={onClose}>
      {!scenario ? (
        <p className="text-xs text-slate-500">Bu SKU için reklam senaryosu hesaplanamadı.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Ek reklam bütçesi</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">+{boostPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={boostPct}
            onChange={(e) => setBoostPct(Number(e.target.value))}
            className="mt-2 w-full h-1 cursor-pointer appearance-none bg-slate-200 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-700"
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Şimdi</div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-700">
                {pct(scenario.currentMarginPct)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Ek reklamla</div>
              <div
                className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                  scenario.projectedMarginPct >= scenario.currentMarginPct ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {pct(scenario.projectedMarginPct)}
              </div>
            </div>
          </div>
          <SimNote />
        </>
      )}
    </PanelShell>
  );
}

function AdjustPricePanel({
  row, tenantId, channel, onClose,
}: {
  row: SkuMargin; tenantId: string; channel: Channel; onClose: () => void;
}) {
  const breakEven = useMemo(() => getSkuBreakEven(tenantId, channel, row.sku), [tenantId, channel, row.sku]);
  return (
    <PanelShell title={`Adjust Price · ${row.sku}`} onClose={onClose}>
      {!breakEven ? (
        <p className="text-xs text-slate-500">Bu SKU için başabaş fiyatı hesaplanamadı.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Ortalama satış fiyatı</span>
            <span className="font-mono text-sm tabular-nums text-slate-600">
              {money(breakEven.avgSellingPrice, breakEven.currency)}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
              {money(breakEven.breakEvenPrice, breakEven.currency)}
            </span>
            <span className="text-[11px] text-slate-500">bu ürünü kârlı yapmak için minimum fiyat</span>
          </div>
          <SimNote />
        </>
      )}
    </PanelShell>
  );
}

function StopAdsPanel({
  row, tenantId, channel, onClose,
}: {
  row: SkuMargin; tenantId: string; channel: Channel; onClose: () => void;
}) {
  const scenario = useMemo(() => simulateSkuAdSpend(tenantId, channel, row.sku, 0), [tenantId, channel, row.sku]);
  return (
    <PanelShell title={`Stop Ads · ${row.sku}`} onClose={onClose}>
      {!scenario ? (
        <p className="text-xs text-slate-500">Bu SKU için reklam senaryosu hesaplanamadı.</p>
      ) : (
        <>
          <p className="text-xs text-slate-600">
            Şu an bu SKU'ya ayrılan reklam harcaması {money(scenario.currentAdSpend, scenario.currency)}. Reklamı
            tamamen durdursan:
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-sm tabular-nums text-slate-500">{pct(scenario.currentMarginPct)}</span>
            <span className="text-slate-400">→</span>
            <span
              className={`font-mono text-2xl font-bold tabular-nums ${
                scenario.projectedMarginPct >= scenario.currentMarginPct ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {pct(scenario.projectedMarginPct)}
            </span>
          </div>
          <SimNote />
        </>
      )}
    </PanelShell>
  );
}

// ─── Sort header ──────────────────────────────────────────────────────────────

type SortKey = "sku" | "category" | "trueMarginPct" | "perceivedMarginPct" | "gapPct" | "returnRatePct";
type SortDir = "asc" | "desc";

function SortHeader({
  label, align = "left", active, direction, onClick,
}: {
  label: string; align?: "left" | "right"; active: boolean; direction: SortDir; onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
    >
      <span>{label}</span>
      <Icon size={12} className={active ? "text-slate-700" : "text-slate-400"} />
    </button>
  );
}

// ─── Perceived vs True mini bars ──────────────────────────────────────────────

function MarginBars({ perceivedPct, truePct }: { perceivedPct: number; truePct: number }) {
  const maxAbs = Math.max(Math.abs(perceivedPct), Math.abs(truePct), 1);
  const percWidth = Math.max(4, (Math.abs(perceivedPct) / maxAbs) * 100);
  const trueWidth = Math.max(4, (Math.abs(truePct) / maxAbs) * 100);
  const trueColor = truePct >= 0 ? "bg-emerald-500" : "bg-red-500";

  return (
    <div className="w-28 space-y-1.5" aria-hidden="true">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-400" style={{ width: `${percWidth}%` }} />
        </div>
        <span className="w-12 text-right font-mono text-[10px] tabular-nums text-slate-500">
          {pct(perceivedPct)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${trueColor}`} style={{ width: `${trueWidth}%` }} />
        </div>
        <span className={`w-12 text-right font-mono text-[10px] tabular-nums ${truePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {pct(truePct)}
        </span>
      </div>
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function MarginTooltip({ row }: { row: SkuMargin }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-64 origin-top-right scale-95 border border-slate-200 bg-white p-3.5 opacity-0 shadow-xl ring-1 ring-black/5 transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100"
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Margin breakdown
      </div>
      <dl className="space-y-1.5 font-mono text-xs tabular-nums text-slate-700">
        <div className="flex justify-between">
          <dt className="text-slate-500">Perceived margin</dt>
          <dd className="font-medium text-slate-900">{pct(row.perceivedMarginPct)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">True margin</dt>
          <dd className={`font-semibold ${row.trueMarginPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {pct(row.trueMarginPct)}
          </dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2">
          <dt className="text-slate-600">Hidden gap</dt>
          <dd className="font-semibold text-red-600">−{row.gapPct.toFixed(1)} pts</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Return rate</dt>
          <dd className={row.isReturnRisk ? "text-red-600 font-semibold" : "text-slate-700"}>
            {row.returnRatePct.toFixed(1)}%{row.isReturnRisk ? " ⚠" : ""}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  skus: SkuMargin[];
  tenantId: string;
  channel: Channel;
  /** Products tab has no navigation of its own — Fund Inventory's "go to
   *  Financing" needs the parent dashboard's tab switcher. */
  onGoToFinancing?: () => void;
}

export function SkuProfitabilityHeatmap({ skus, tenantId, channel, onGoToFinancing }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("trueMarginPct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...skus];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "sku":             diff = a.sku.localeCompare(b.sku); break;
        case "category":        diff = a.category.localeCompare(b.category); break;
        case "trueMarginPct":   diff = a.trueMarginPct - b.trueMarginPct; break;
        case "perceivedMarginPct": diff = a.perceivedMarginPct - b.perceivedMarginPct; break;
        case "gapPct":          diff = a.gapPct - b.gapPct; break;
        case "returnRatePct":   diff = a.returnRatePct - b.returnRatePct; break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return arr;
  }, [skus, sortKey, sortDir]);

  const silentLosers = skus.filter((s) => s.isSilentLoser).length;
  const cashCows     = skus.filter((s) => s.trueMarginPct > 20).length;
  const returnRisks  = skus.filter((s) => s.isReturnRisk).length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  if (skus.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Bu kanal için SKU verisi bulunamadı.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Package size={16} />
          </span>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900">
              SKU Profitability Heatmap
            </h3>
            <p className="text-xs text-slate-500">
              Real contribution margin per SKU — powered by perSkuMargins() engine output.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {silentLosers > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {silentLosers} Silent Loser{silentLosers > 1 ? "s" : ""}
            </span>
          )}
          {cashCows > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {cashCows} Cash Cow{cashCows > 1 ? "s" : ""}
            </span>
          )}
          {returnRisks > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {returnRisks} Yüksek İade
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="border-b border-slate-200 px-6 py-3 text-left">
                <SortHeader label="SKU" active={sortKey === "sku"} direction={sortDir} onClick={() => handleSort("sku")} />
              </th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3 text-left">
                <SortHeader label="Kategori" active={sortKey === "category"} direction={sortDir} onClick={() => handleSort("category")} />
              </th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Algılanan / Gerçek
                </span>
              </th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3 text-right">
                <SortHeader label="True Margin" align="right" active={sortKey === "trueMarginPct"} direction={sortDir} onClick={() => handleSort("trueMarginPct")} />
              </th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3 text-right">
                <SortHeader label="Gap" align="right" active={sortKey === "gapPct"} direction={sortDir} onClick={() => handleSort("gapPct")} />
              </th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3 text-right">
                <SortHeader label="İade %" align="right" active={sortKey === "returnRatePct"} direction={sortDir} onClick={() => handleSort("returnRatePct")} />
              </th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
              </th>
              <th scope="col" className="border-b border-slate-200 px-6 py-3 text-right">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const bucket = marginBucket(row.trueMarginPct);
              return (
                <tr key={row.sku} className="group/row transition-colors hover:bg-slate-50/70">
                  {/* SKU */}
                  <td className="border-b border-slate-100 px-6 py-3">
                    <div className="font-mono text-sm font-medium text-slate-900">{row.sku}</div>
                    {row.isReturnRisk && (
                      <div className="mt-0.5 text-[10px] font-semibold text-amber-600">İade Riski</div>
                    )}
                  </td>

                  {/* Category */}
                  <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
                    {row.category}
                  </td>

                  {/* Bars */}
                  <td className="border-b border-slate-100 px-4 py-3">
                    <MarginBars perceivedPct={row.perceivedMarginPct} truePct={row.trueMarginPct} />
                  </td>

                  {/* True margin cell + tooltip */}
                  <td className="relative border-b border-slate-100 px-4 py-3 text-right">
                    <div className="group relative inline-block">
                      <div
                        className={`inline-flex cursor-help items-center rounded-lg px-3 py-1.5 font-mono tabular-nums ${bucket.cellClass}`}
                        tabIndex={0}
                      >
                        <span className="text-sm font-semibold">{pct(row.trueMarginPct)}</span>
                      </div>
                      <MarginTooltip row={row} />
                    </div>
                  </td>

                  {/* Gap */}
                  <td className="border-b border-slate-100 px-4 py-3 text-right font-mono text-sm tabular-nums text-red-600">
                    −{row.gapPct.toFixed(1)} pts
                  </td>

                  {/* Return rate */}
                  <td className={`border-b border-slate-100 px-4 py-3 text-right font-mono text-sm tabular-nums ${row.isReturnRisk ? "text-amber-600 font-semibold" : "text-slate-500"}`}>
                    {row.returnRatePct.toFixed(1)}%
                  </td>

                  {/* Status chip */}
                  <td className="border-b border-slate-100 px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${bucket.chipClass}`}>
                      <bucket.Icon size={12} />
                      {bucket.label}
                    </span>
                    {row.isSilentLoser && (
                      <div className="mt-0.5 text-[10px] text-red-500 font-mono">SILENT LOSS</div>
                    )}
                  </td>

                  {/* Action */}
                  <td className="border-b border-slate-100 px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setExpandedSku((cur) => (cur === row.sku ? null : row.sku))}
                      aria-expanded={expandedSku === row.sku}
                      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${bucket.actionClass}`}
                    >
                      {row.trueMarginPct < 0 && <AlertCircle size={12} className="mr-1.5" />}
                      {bucket.actionLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
            {expandedSku && (() => {
              const row = sorted.find((r) => r.sku === expandedSku);
              if (!row) return null;
              const bucket = marginBucket(row.trueMarginPct);
              const close = () => setExpandedSku(null);
              return (
                <tr key={`${expandedSku}-panel`}>
                  <td colSpan={8} className="border-b border-slate-100 bg-slate-100/60 px-6 py-5">
                    {bucket.key === "cash-cow" && (
                      <FundInventoryPanel row={row} tenantId={tenantId} channel={channel} onClose={close} onGoToFinancing={onGoToFinancing} />
                    )}
                    {bucket.key === "profitable" && (
                      <ScaleAdsPanel row={row} tenantId={tenantId} channel={channel} onClose={close} />
                    )}
                    {bucket.key === "bleeding" && (
                      <AdjustPricePanel row={row} tenantId={tenantId} channel={channel} onClose={close} />
                    )}
                    {bucket.key === "silent-loser" && (
                      <StopAdsPanel row={row} tenantId={tenantId} channel={channel} onClose={close} />
                    )}
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium uppercase tracking-wider">Legend</span>
          {(["cash-cow", "profitable", "bleeding", "silent-loser"] as BucketKey[])
            .sort((a, b) => BUCKET_ORDER[b] - BUCKET_ORDER[a])
            .map((k) => {
              const b = marginBucket(k === "cash-cow" ? 30 : k === "profitable" ? 10 : k === "bleeding" ? -3 : -10);
              return (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${b.dotClass}`} />
                  {b.label}
                </span>
              );
            })}
        </div>
        <span className="font-mono tabular-nums">
          {skus.length} SKU · engine: perSkuMargins()
        </span>
      </div>
    </div>
  );
}
