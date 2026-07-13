"use client";

/**
 * Sector benchmarking — segmented, percentile-based, k-anonymous.
 *
 * The seller's REAL engine-computed metrics are ranked against a peer
 * distribution for THEIR segment (marketplace × dominant category × revenue
 * size), shown as a p10/p50/p90 spread with the seller's own position and the
 * percentile of peers they beat.
 *
 * Data source is disclosed per metric:
 *   - "pooled"    → a live distribution over ≥5 real sellers in the segment
 *                   (k-anonymous — see lib/benchmarks/aggregate.ts). Shows N.
 *   - "published" → a sourced representative estimate, used until a segment has
 *                   enough real sellers to pool. Clearly labelled, no fake N.
 *
 * Real signed-in users fetch /api/benchmarks/segment (pooled-aware). The demo
 * (seed sellers, no auth) ranks locally against the published distribution with
 * the exact same math and UI — so the demo is honest, not a different code path.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Channel, SellerView } from "@/lib/engine";
import { getSupabaseClient } from "@/lib/supabase/client";
import { computeMetricsFromView, sizeBucketForUsd, toUsd } from "@/lib/benchmarks/metrics";
import { publishedBenchmarks } from "@/lib/benchmarks/published";
import { rankMetric, type RankedMetric } from "@/lib/benchmarks/rank";
import { ANY, METRIC_KEYS, type MetricKey } from "@/lib/benchmarks/types";

// ─── metric display ────────────────────────────────────────────────────────────

const METRIC_LABEL_KEY: Record<MetricKey, string> = {
  true_margin_pct: "benchmark.trueMargin",
  return_rate_pct: "benchmark.returnRate",
  acos_pct: "benchmark.acos",
  shipping_ratio_pct: "benchmark.shippingRatio",
  commission_ratio_pct: "benchmark.commissionRatio",
  cogs_ratio_pct: "benchmark.cogsRatio",
};

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const STANDING = {
  good: { key: "benchmark.standingGood", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", bar: "bg-emerald-500", Icon: CheckCircle2 },
  near: { key: "benchmark.standingNear", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400", bar: "bg-amber-500", Icon: Minus },
  behind: { key: "benchmark.standingBehind", cls: "border-red-500/30 bg-red-500/10 text-red-400", bar: "bg-red-500", Icon: AlertTriangle },
} as const;

// ─── one metric card ────────────────────────────────────────────────────────────

function MetricCard({ m }: { m: RankedMetric }) {
  const { t } = useTranslation();
  const cfg = STANDING[m.standing];
  const { Icon } = cfg;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm transition-colors hover:border-zinc-700 hover:bg-zinc-900/80">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{t(METRIC_LABEL_KEY[m.metric])}</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cfg.cls}`}>
          <Icon size={12} />
          {t(cfg.key)}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold tabular-nums text-zinc-100">{fmtPct(m.yours)}</span>
        <span className="text-[11px] text-zinc-500 font-mono">{t("benchmark.yoursEngine")}</span>
      </div>

      {/* Percentile bar: left = weakest peers, right = strongest. Median tick at
          50%, the seller's own position at their percentile rank. */}
      <div className="relative mt-1 select-none">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className={`absolute left-0 top-0 h-full rounded-full ${cfg.bar}`} style={{ width: `${m.betterThanPct}%` }} />
        </div>
        <div className="absolute -top-0.5 flex -translate-x-1/2 flex-col items-center" style={{ left: "50%" }}>
          <div className="h-2.5 w-px bg-zinc-500" />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600">
          <span>{t("benchmark.weakerPeers")}</span>
          <span className="text-zinc-500">{t("benchmark.median")} {fmtPct(m.p50)}</span>
          <span>{t("benchmark.strongerPeers")}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
        <span className="text-[12px] text-zinc-300">
          {t("benchmark.betterThan", { pct: m.betterThanPct })}
        </span>
        <span className="text-[10px] font-mono text-zinc-600">
          {m.source === "pooled" ? t("benchmark.liveSample", { n: m.sampleSize }) : t("benchmark.representative")}
        </span>
      </div>
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────────

interface Props {
  view: SellerView;
  channel: Channel;
  authConfigured: boolean;
}

export function PeerBenchmarkingSection({ view, channel, authConfigured }: Props) {
  const { t } = useTranslation();

  // `view` is a brand-new object EVERY render of the parent dashboard (it's
  // computed inline, not memoized — see app/dashboard/page.tsx) even when the
  // seller's actual numbers haven't changed. Depending on `view` directly
  // would re-fire the effects below on every unrelated parent re-render —
  // confirmed live: during initial dashboard load (billing status, resync
  // list, ledger, etc. each resolving in their own effect) this fired 8-11
  // redundant /api/benchmarks/segment calls within ~6 seconds for one page
  // load. Deriving a primitive string from just the fields that actually feed
  // `computeMetricsFromView` stabilizes the dependency: React compares
  // primitives by VALUE, so the effects only re-run when a real number moves.
  const yours = computeMetricsFromView(view);
  const viewSignature = JSON.stringify([
    view.tenantId, view.channel, view.currency, view.monthlyRevenue, view.category, yours,
  ]);

  // Local, published-based ranking — computed synchronously from the same
  // engine numbers the rest of the dashboard shows. Used as-is for the demo,
  // and as the instant first paint for real users before the API responds.
  const localRanked = useMemo<RankedMetric[]>(() => {
    const marketplace = channel === "combined" ? ANY : channel;
    const category = view.category || ANY;
    const sizeBucket = sizeBucketForUsd(toUsd(view.monthlyRevenue, view.currency));
    const rows = publishedBenchmarks();
    return METRIC_KEYS.map((metric) =>
      rankMetric(rows, marketplace, category, sizeBucket, metric, yours[metric])
    ).filter((m): m is RankedMetric => m !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSignature, channel]);

  const [ranked, setRanked] = useState<RankedMetric[]>(localRanked);
  useEffect(() => setRanked(localRanked), [localRanked]);

  // Real users: replace with pooled-aware ranking from the server.
  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      try {
        const res = await fetch(`/api/benchmarks/segment?channel=${encodeURIComponent(channel)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await res.json().catch(() => ({}));
        if (active && res.ok && Array.isArray(result.metrics) && result.metrics.length > 0) {
          setRanked(result.metrics as RankedMetric[]);
        }
      } catch {
        // Keep the local published-based ranking on any failure.
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authConfigured, channel, viewSignature]);

  const anyPooled = ranked.some((m) => m.source === "pooled");

  return (
    <section aria-labelledby="peer-benchmarking-title">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 id="peer-benchmarking-title" className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em]">
          {t("benchmark.title")}
        </h2>
        <span className="text-zinc-700 text-[10px] font-mono border border-zinc-800 px-2 py-0.5">
          {anyPooled ? t("benchmark.pooledHeader") : t("benchmark.representativeUS")}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.map((m) => (
          <MetricCard key={m.metric} m={m} />
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-zinc-600 font-mono max-w-3xl">
        {t("benchmark.methodology")}
      </p>
    </section>
  );
}
