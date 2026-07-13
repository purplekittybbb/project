/**
 * Turn one seller's real transactions into per-segment metric slices.
 *
 * CRITICAL: this never re-implements margin math. It slices the seller's own
 * transactions by (marketplace, category) and runs each slice back through the
 * SAME `buildSellerView` the dashboard uses, so a seller's benchmarked numbers
 * are byte-for-byte the numbers they already see on their own screens — the
 * engine stays the single source of truth.
 */

import {
  buildSellerView,
  USD_TO_TRY,
  type Channel,
  type SeededSeller,
  type SellerView,
  type Transaction,
} from "@/lib/engine";
import {
  SIZE_BUCKET_USD_MAX,
  type MetricKey,
  type MetricSlice,
  type SizeBucket,
} from "./types";

/** Monthly revenue → size bucket. Input already normalized to USD. */
export function sizeBucketForUsd(monthlyRevenueUsd: number): SizeBucket {
  if (monthlyRevenueUsd < SIZE_BUCKET_USD_MAX.micro) return "micro";
  if (monthlyRevenueUsd < SIZE_BUCKET_USD_MAX.small) return "small";
  if (monthlyRevenueUsd < SIZE_BUCKET_USD_MAX.mid) return "mid";
  return "large";
}

/** Normalize an amount in `currency` to USD, using the same rate the engine
 *  uses for combined-channel reporting (so size buckets are consistent with
 *  the numbers shown elsewhere). */
export function toUsd(amount: number, currency: string): number {
  return currency === "USD" ? amount : amount / USD_TO_TRY;
}

function ratioPct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

/**
 * The 6 benchmark metrics for one SellerView — the SINGLE definition, used both
 * by the per-slice extractor (cron/aggregation side) and the read route (a
 * signed-in user's "yours" values), so a user's benchmarked number is exactly
 * the number the rest of their dashboard shows.
 */
export function computeMetricsFromView(view: SellerView): Record<MetricKey, number> {
  const w = view.waterfall;
  const returnRatePct =
    view.skus.length > 0
      ? view.skus.reduce((s, sk) => s + sk.returnRatePct, 0) / view.skus.length
      : 0;
  return {
    true_margin_pct: round2(view.trueMarginPct),
    return_rate_pct: round2(returnRatePct),
    acos_pct: round2(ratioPct(w.adSpendAllocated, w.grossRevenue)),
    shipping_ratio_pct: round2(ratioPct(w.shipping, w.grossRevenue)),
    commission_ratio_pct: round2(ratioPct(w.commission, w.grossRevenue)),
    cogs_ratio_pct: round2(ratioPct(w.cogs, w.grossRevenue)),
  };
}

/** Distinct (marketplace, category) pairs present in a transaction set. */
function sliceKeys(txs: Transaction[]): { marketplace: string; category: string }[] {
  const seen = new Map<string, { marketplace: string; category: string }>();
  for (const t of txs) {
    const key = `${t.marketplace}::${t.category}`;
    if (!seen.has(key)) seen.set(key, { marketplace: t.marketplace, category: t.category });
  }
  return [...seen.values()];
}

/**
 * Extract every (marketplace, category) metric slice a seller contributes.
 * Each slice's metrics come from a real `buildSellerView` over just that
 * slice's transactions, so they match the dashboard exactly. Returns [] for a
 * seller with no transactions.
 */
export function extractMetricSlices(seller: SeededSeller): MetricSlice[] {
  const out: MetricSlice[] = [];

  for (const { marketplace, category } of sliceKeys(seller.transactions)) {
    const sliceTxs = seller.transactions.filter(
      (t) => t.marketplace === marketplace && t.category === category
    );
    if (sliceTxs.length === 0) continue;

    const subSeller: SeededSeller = { ...seller, transactions: sliceTxs };
    // marketplace is a real Marketplace value (Channel excludes only "combined"),
    // so this always builds a single-marketplace view of the slice.
    const view = buildSellerView(subSeller, marketplace as Channel);
    if (!view) continue;

    const metrics = computeMetricsFromView(view);
    const monthlyRevenueUsd = toUsd(view.monthlyRevenue, view.currency);

    out.push({
      marketplace,
      category,
      sizeBucket: sizeBucketForUsd(monthlyRevenueUsd),
      monthlyRevenueUsd: Math.round(monthlyRevenueUsd),
      metrics,
    });
  }

  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
