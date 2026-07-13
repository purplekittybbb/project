import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildUserSeller } from "@/lib/supabase/user-data";
import { extractMetricSlices } from "@/lib/benchmarks/metrics";
import { aggregatePooled, mergeWithPublished } from "@/lib/benchmarks/aggregate";
import { logBenchmarkFallback } from "@/lib/benchmarks/fallback-log";
import { publishedBenchmarks } from "@/lib/benchmarks/published";
import { K_ANON, type SellerSlices } from "@/lib/benchmarks/types";
import type { UserRawRow } from "@/lib/adapters/csv";

/**
 * GET /api/cron/compute-benchmarks
 *
 * Recomputes the pooled sector benchmarks from the WHOLE user base's real data
 * and writes them to `sector_benchmarks`. This is the data-network-effect
 * engine: every seller's real metrics (from the same margin engine the
 * dashboard uses) are pooled into per-segment percentile distributions, with a
 * k-anonymity floor so no individual seller is ever exposed (see
 * lib/benchmarks/aggregate.ts). Segments below the floor fall back to sourced
 * published estimates (lib/benchmarks/published.ts).
 *
 * ── Security ─────────────────────────────────────────────────────────────
 * Locked behind CRON_SECRET, exactly like /api/cron/sync-marketplaces — Vercel
 * sends `Authorization: Bearer <CRON_SECRET>` when IT invokes the route. This
 * gate is essential BECAUSE the route uses a SERVICE-ROLE client (bypasses RLS)
 * to read every user's transactions for aggregation. The service-role key is
 * created only inside this file, never exported, never logged. Output is only
 * ever k-anonymous aggregates (>=5 sellers) + published rows — never a single
 * user's row.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface TxRow {
  user_id: string;
  order_id: string;
  sku: string;
  category: string;
  sale_date: string;
  units: number;
  gross_revenue: number;
  unit_cost: number;
  shipping: number;
  return_rate: number;
  ad_spend: number;
  marketplace: string;
}

const PAGE = 1000;

/** Read every user_transactions row, paginated (service-role bypasses RLS). */
async function readAllTransactions(supabase: SupabaseClient): Promise<TxRow[]> {
  const all: TxRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("user_transactions")
      .select(
        "user_id, order_id, sku, category, sale_date, units, gross_revenue, unit_cost, shipping, return_rate, ad_spend, marketplace"
      )
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as TxRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

function toUserRawRow(r: TxRow): UserRawRow {
  return {
    order_id: r.order_id,
    sku: r.sku,
    category: r.category,
    sale_date: String(r.sale_date).slice(0, 10),
    units: Number(r.units),
    gross_revenue: Number(r.gross_revenue),
    unit_cost: Number(r.unit_cost),
    shipping: Number(r.shipping),
    return_rate: Number(r.return_rate),
    ad_spend: Number(r.ad_spend),
    marketplace: r.marketplace ?? "trendyol",
  };
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[cron/compute-benchmarks] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not configured.");
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  let txRows: TxRow[];
  try {
    txRows = await readAllTransactions(supabase);
  } catch (err) {
    console.error("[cron/compute-benchmarks] failed to read user_transactions:", err);
    return NextResponse.json({ error: "İşlem verileri okunamadı." }, { status: 500 });
  }

  // Group by user, build each seller via the SAME engine the dashboard uses,
  // and extract their per-(marketplace,category) metric slices.
  const byUser = new Map<string, UserRawRow[]>();
  for (const r of txRows) {
    const group = byUser.get(r.user_id) ?? [];
    group.push(toUserRawRow(r));
    byUser.set(r.user_id, group);
  }

  const sellers: SellerSlices[] = [];
  for (const [userId, rows] of byUser) {
    const seller = buildUserSeller(rows);
    if (!seller) continue;
    const slices = extractMetricSlices(seller);
    if (slices.length > 0) sellers.push({ userId, slices });
  }

  const pooled = aggregatePooled(sellers);
  const merged = mergeWithPublished(pooled, publishedBenchmarks());

  const computedAt = new Date().toISOString();
  const payload = merged.map((r) => ({
    marketplace: r.marketplace,
    category: r.category,
    size_bucket: r.sizeBucket,
    metric: r.metric,
    p10: r.p10,
    p50: r.p50,
    p90: r.p90,
    sample_size: r.sampleSize,
    source: r.source,
    computed_at: computedAt,
  }));

  const { error: upsertError } = await supabase
    .from("sector_benchmarks")
    .upsert(payload, { onConflict: "marketplace,category,size_bucket,metric" });
  if (upsertError) {
    console.error("[cron/compute-benchmarks] upsert failed:", upsertError.message);
    return NextResponse.json({ error: "Benchmark kaydı güncellenemedi." }, { status: 502 });
  }

  // Remove any segment that was NOT refreshed this run (e.g. a pooled segment
  // that dropped below the k-anonymity floor since last time) — it now has a
  // stale computed_at and must not linger.
  const { error: pruneError } = await supabase
    .from("sector_benchmarks")
    .delete()
    .lt("computed_at", computedAt);
  if (pruneError) {
    console.error("[cron/compute-benchmarks] prune of stale rows failed:", pruneError.message);
    // Non-fatal: the fresh rows are already written; stale rows just linger
    // until the next run. Report success with a note rather than failing.
  }

  const pooledCount = merged.filter((r) => r.source === "pooled").length;
  const publishedCount = merged.length - pooledCount;
  if (pooledCount === 0 && merged.length > 0) {
    logBenchmarkFallback({
      reason: "k_anon_insufficient",
      route: "cron/compute-benchmarks",
      sellerCount: sellers.length,
      kAnonThreshold: K_ANON,
      publishedRowCount: publishedCount,
      totalRowCount: merged.length,
      fallback: "published",
    });
  } else {
    console.log(
      `[cron/compute-benchmarks] ${sellers.length} seller(s) → ${pooledCount} pooled + ` +
        `${merged.length - pooledCount} published row(s) written.`
    );
  }

  return NextResponse.json({
    sellers: sellers.length,
    rowsWritten: merged.length,
    pooledRows: pooledCount,
    publishedRows: merged.length - pooledCount,
  });
}
