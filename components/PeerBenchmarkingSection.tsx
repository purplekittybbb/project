"use client";

/**
 * Peer Benchmarking — compares the seller's REAL engine-computed metrics
 * against representative sector averages.
 *
 * "Yours" values come from SellerView (engine output):
 *   - iadeOrani    → mean of view.skus[].returnRatePct
 *   - ACOS         → waterfall.adSpendAllocated / waterfall.grossRevenue × 100
 *   - kargoGelir   → waterfall.shipping / waterfall.grossRevenue × 100
 *
 * Sector averages and Top-10% thresholds are REPRESENTATIVE (modelled on
 * publicly available Turkish e-commerce benchmarks). They are clearly labelled
 * "(Temsili)" so no fake-real conflation occurs.
 */

import { AlertTriangle, BarChart3, CheckCircle2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { SellerView } from "@/lib/engine";

// ─── types ────────────────────────────────────────────────────────────────────

interface BenchmarkMetric {
  id: string;
  label: string;
  sublabel: string;
  icon: typeof BarChart3;
  yoursRaw: number;
  categoryAvgRaw: number;
  top10Raw: number;
  lowerIsBetter: boolean;
  formatValue: (v: number) => string;
}

type Standing = "behind" | "good" | "near";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStanding(m: BenchmarkMetric): Standing {
  const betterThanAvg = m.lowerIsBetter
    ? m.yoursRaw < m.categoryAvgRaw
    : m.yoursRaw > m.categoryAvgRaw;
  const nearAvg = Math.abs(m.yoursRaw - m.categoryAvgRaw) / (m.categoryAvgRaw || 1) < 0.08;
  if (betterThanAvg) return "good";
  if (nearAvg) return "near";
  return "behind";
}

const STANDING_CONFIG = {
  behind: { badge: "Sektörün Gerisinde", badgeClass: "border border-red-500/30 bg-red-500/10 text-red-400",     Icon: AlertTriangle },
  good:   { badge: "Sektörden İyi",      badgeClass: "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400", Icon: CheckCircle2 },
  near:   { badge: "Sektör Ortalaması",  badgeClass: "border border-amber-500/30 bg-amber-500/10 text-amber-400",  Icon: Minus },
} as const;

/** Clamp a value onto a 0–100 bar anchored to [best, worst]. */
function barPosition(m: BenchmarkMetric, value: number): number {
  const worst = m.lowerIsBetter
    ? Math.max(m.yoursRaw, m.categoryAvgRaw) * 1.15
    : Math.min(m.yoursRaw, m.categoryAvgRaw) * 0.85;
  const best = m.lowerIsBetter ? m.top10Raw * 0.8 : m.top10Raw * 1.1;
  const span = Math.abs(worst - best);
  if (span === 0) return 50;
  const pos = m.lowerIsBetter
    ? ((worst - value) / span) * 100
    : ((value - best) / span) * 100;
  return Math.min(100, Math.max(0, pos));
}

// ─── BarTrack ─────────────────────────────────────────────────────────────────

function BarTrack({ metric }: { metric: BenchmarkMetric }) {
  const yoursPos  = barPosition(metric, metric.yoursRaw);
  const avgPos    = barPosition(metric, metric.categoryAvgRaw);
  const top10Pos  = barPosition(metric, metric.top10Raw);
  const standing  = getStanding(metric);
  const fillClass = standing === "good" ? "bg-emerald-500" : standing === "near" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="relative mt-2 select-none">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={`absolute left-0 top-0 h-full rounded-full ${fillClass}`} style={{ width: `${yoursPos}%` }} />
      </div>
      <div className="absolute -top-0.5 flex -translate-x-1/2 flex-col items-center" style={{ left: `${top10Pos}%` }}>
        <div className="h-2.5 w-px bg-emerald-500/60" />
      </div>
      <div className="absolute -top-0.5 flex -translate-x-1/2 flex-col items-center" style={{ left: `${avgPos}%` }}>
        <div className="h-2.5 w-px bg-zinc-500" />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600">
        <span className="text-emerald-600">Top 10% {metric.formatValue(metric.top10Raw)} (Temsili)</span>
        <span>Avg {metric.formatValue(metric.categoryAvgRaw)} (Temsili)</span>
      </div>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ metric }: { metric: BenchmarkMetric }) {
  const standing = getStanding(metric);
  const { badge, badgeClass, Icon: BadgeIcon } = STANDING_CONFIG[standing];
  const { icon: MetricIcon } = metric;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm transition-colors hover:border-zinc-700 hover:bg-zinc-900/80 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-800/80">
        <MetricIcon size={18} className="text-zinc-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{metric.label}</h3>
            <p className="text-[11px] text-zinc-500">{metric.sublabel}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeClass}`}>
            <BadgeIcon size={12} />
            {badge}
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-xl font-bold tabular-nums text-zinc-100">
            {metric.formatValue(metric.yoursRaw)}
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">gerçek (motordan)</span>
        </div>

        <BarTrack metric={metric} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  view: SellerView;
}

export function PeerBenchmarkingSection({ view }: Props) {
  const { skus, waterfall } = view;

  // ── Real computed values from the engine ────────────────────────────────────
  const avgReturnRate =
    skus.length > 0
      ? skus.reduce((s, sk) => s + sk.returnRatePct, 0) / skus.length
      : 0;

  const acos =
    waterfall.grossRevenue > 0
      ? (waterfall.adSpendAllocated / waterfall.grossRevenue) * 100
      : 0;

  const kargoGelir =
    waterfall.grossRevenue > 0
      ? (waterfall.shipping / waterfall.grossRevenue) * 100
      : 0;

  // ── Representative sector benchmarks (clearly labelled Temsili) ─────────────
  const METRICS: BenchmarkMetric[] = [
    {
      id: "return-rate",
      label: "İade Oranı",
      sublabel: "Gerçek değer: SKU iade ortalaması (motordan)",
      icon: TrendingDown,
      yoursRaw: avgReturnRate,
      categoryAvgRaw: 5.4,   // Temsili
      top10Raw: 2.1,          // Temsili
      lowerIsBetter: true,
      formatValue: (v) => `${v.toFixed(1)}%`,
    },
    {
      id: "acos",
      label: "Reklam Verimliliği (ACOS)",
      sublabel: "Gerçek değer: reklam harcaması / brüt gelir (motordan)",
      icon: BarChart3,
      yoursRaw: acos,
      categoryAvgRaw: 18.0,  // Temsili
      top10Raw: 10.0,         // Temsili
      lowerIsBetter: true,
      formatValue: (v) => `${v.toFixed(1)}%`,
    },
    {
      id: "shipping-ratio",
      label: "Kargo / Gelir Oranı",
      sublabel: "Gerçek değer: kargo maliyeti / brüt gelir (motordan)",
      icon: TrendingUp,
      yoursRaw: kargoGelir,
      categoryAvgRaw: 5.5,   // Temsili
      top10Raw: 3.2,          // Temsili
      lowerIsBetter: true,
      formatValue: (v) => `${v.toFixed(1)}%`,
    },
  ];

  return (
    <section aria-labelledby="peer-benchmarking-title">
      <div className="mb-6 flex items-center gap-4">
        <h2 id="peer-benchmarking-title" className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em]">
          Sektör Kıyaslaması
        </h2>
        <span className="text-zinc-700 text-[10px] font-mono border border-zinc-800 px-2 py-0.5">
          Sektör ortalamaları temsilidir
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((m) => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </div>
    </section>
  );
}
