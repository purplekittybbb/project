import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildSellerView, type Channel } from "@/lib/engine";
import { DEFAULT_CHANNEL } from "@/lib/product-market";
import { buildUserSeller } from "@/lib/supabase/user-data";
import { computeMetricsFromView, sizeBucketForUsd, toUsd } from "@/lib/benchmarks/metrics";
import { mergeWithPublished } from "@/lib/benchmarks/aggregate";
import { publishedBenchmarks } from "@/lib/benchmarks/published";
import { rankMetric } from "@/lib/benchmarks/rank";
import {
  classifyBenchmarkTableError,
  logBenchmarkFallback,
} from "@/lib/benchmarks/fallback-log";
import { ANY, METRIC_KEYS, type BenchmarkRow, type SizeBucket } from "@/lib/benchmarks/types";
import type { UserRawRow } from "@/lib/adapters/csv";

/**
 * GET /api/benchmarks/segment?channel=<marketplace|combined>
 *
 * For the signed-in user: computes their real metrics on the requested channel
 * (via the SAME engine the dashboard uses), determines their segment
 * (marketplace × dominant category × revenue-size bucket), and ranks each
 * metric against the best available benchmark — a live pooled percentile
 * distribution where one exists (>=5 sellers), otherwise a sourced published
 * estimate. Every returned metric discloses its sample size and source.
 *
 * Reads `sector_benchmarks` with the user's own token (RLS allows any
 * authenticated user to read the aggregate table). If the table is empty or not
 * yet migrated, it transparently falls back to the in-memory published
 * benchmarks, so the panel always works.
 */
export const runtime = "nodejs";

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface DbBenchmarkRow {
  marketplace: string;
  category: string;
  size_bucket: string;
  metric: string;
  p10: number;
  p50: number;
  p90: number;
  sample_size: number;
  source: string;
}

function toBenchmarkRow(r: DbBenchmarkRow): BenchmarkRow {
  return {
    marketplace: r.marketplace,
    category: r.category,
    sizeBucket: r.size_bucket as SizeBucket | typeof ANY,
    metric: r.metric as BenchmarkRow["metric"],
    p10: Number(r.p10),
    p50: Number(r.p50),
    p90: Number(r.p90),
    sampleSize: Number(r.sample_size),
    source: r.source === "pooled" ? "pooled" : "published",
  };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz." }, { status: 401 });
  }

  const url = new URL(req.url);
  const channelParam = (url.searchParams.get("channel") ?? "combined") as Channel;

  // Load the user's own rows (RLS-scoped) and build their seller via the engine.
  const { data: rows } = await supabase
    .from("user_transactions")
    .select("order_id, sku, category, sale_date, units, gross_revenue, unit_cost, shipping, return_rate, ad_spend, marketplace");
  const rawRows: UserRawRow[] = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
    order_id: String(r.order_id ?? ""),
    sku: String(r.sku ?? ""),
    category: String(r.category ?? ""),
    sale_date: String(r.sale_date ?? "").slice(0, 10),
    units: Number(r.units ?? 0),
    gross_revenue: Number(r.gross_revenue ?? 0),
    unit_cost: Number(r.unit_cost ?? 0),
    shipping: Number(r.shipping ?? 0),
    return_rate: Number(r.return_rate ?? 0),
    ad_spend: Number(r.ad_spend ?? 0),
    marketplace: String(r.marketplace ?? "trendyol"),
  }));

  const seller = buildUserSeller(rawRows);
  if (!seller) {
    return NextResponse.json({ hasData: false, metrics: [] });
  }

  // Resolve the view for the requested channel (fall back like the dashboard).
  const view =
    buildSellerView(seller, channelParam) ??
    buildSellerView(seller, DEFAULT_CHANNEL) ??
    buildSellerView(seller, "combined");
  if (!view) {
    return NextResponse.json({ hasData: false, metrics: [] });
  }

  const yours = computeMetricsFromView(view);
  const monthlyRevenueUsd = toUsd(view.monthlyRevenue, view.currency);
  const sizeBucket = sizeBucketForUsd(monthlyRevenueUsd);

  // Dominant category on this channel (by gross revenue) — the segment axis.
  const channelTxs =
    channelParam === "combined"
      ? seller.transactions
      : seller.transactions.filter((t) => t.marketplace === channelParam);
  const revByCategory = new Map<string, number>();
  for (const t of channelTxs) {
    revByCategory.set(t.category, (revByCategory.get(t.category) ?? 0) + t.grossRevenue);
  }
  const dominantCategory =
    [...revByCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ANY;

  const marketplace = channelParam === "combined" ? ANY : channelParam;

  // Read benchmark rows (RLS: any authenticated user may read). Fall back to the
  // in-memory published set if the table is missing/empty so the panel always works.
  let dbRows: BenchmarkRow[] = [];
  const { data: benchData, error: benchError } = await supabase
    .from("sector_benchmarks")
    .select("marketplace, category, size_bucket, metric, p10, p50, p90, sample_size, source");
  if (!benchError && Array.isArray(benchData)) {
    dbRows = (benchData as DbBenchmarkRow[]).map(toBenchmarkRow);
  }

  if (benchError) {
    logBenchmarkFallback({
      reason: classifyBenchmarkTableError(benchError.message, benchError.code),
      route: "benchmarks/segment",
      userId: userData.user.id,
      error: benchError.message,
      errorCode: benchError.code,
      segment: { marketplace, category: dominantCategory, sizeBucket },
      fallback: "published",
    });
  } else if (dbRows.length === 0) {
    logBenchmarkFallback({
      reason: "empty_table",
      route: "benchmarks/segment",
      userId: userData.user.id,
      segment: { marketplace, category: dominantCategory, sizeBucket },
      fallback: "published",
    });
  }

  const rowsForRank = mergeWithPublished(dbRows, publishedBenchmarks());

  const metrics = METRIC_KEYS.map((metric) =>
    rankMetric(rowsForRank, marketplace, dominantCategory, sizeBucket, metric, yours[metric])
  ).filter((m): m is NonNullable<typeof m> => m !== null);

  const publishedMetricCount = metrics.filter((m) => m.source === "published").length;
  if (publishedMetricCount > 0) {
    logBenchmarkFallback({
      reason: "partial_published",
      route: "benchmarks/segment",
      userId: userData.user.id,
      segment: { marketplace, category: dominantCategory, sizeBucket },
      publishedMetricCount,
      pooledMetricCount: metrics.length - publishedMetricCount,
      totalMetrics: metrics.length,
      fallback: "published",
    });
  }

  return NextResponse.json({
    hasData: true,
    segment: { marketplace, category: dominantCategory, sizeBucket },
    channel: view.channel,
    currency: view.currency,
    metrics,
  });
}
