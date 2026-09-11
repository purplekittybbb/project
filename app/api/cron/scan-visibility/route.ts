import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildScanQueue } from "@/lib/demand/queue";
import { searchProductRank } from "@/lib/scrapers/visibility";
import { insertVisibilityCheck } from "@/lib/supabase/visibility-checks";
import {
  upsertSharedVisibilityScan,
  ensureVisibilityWatch,
  loadSharedLastScans,
} from "@/lib/supabase/shared-visibility";
import { createBrowserSession } from "@/lib/scrapers/browser";
import type { SkuMargin } from "@/lib/domain/margin-engine";

/**
 * POST /api/cron/scan-visibility
 *
 * Scheduled visibility scan — scans a user's SKUs for marketplace search rank.
 *
 * ── Security ─────────────────────────────────────────────────────────────
 * Locked behind CRON_SECRET (same pattern as sync-marketplaces).
 * Request is rejected before anything else runs if the Authorization header
 * doesn't match.
 *
 * ── Rate limit guard ──────────────────────────────────────────────────────
 * Scans at most SCAN_BATCH_SIZE (default 5, max 10) SKUs per invocation.
 * A 3-second delay is added between each SKU scan to avoid overwhelming the
 * marketplace. First live run requires explicit user approval.
 *
 * ── Graceful degradation ─────────────────────────────────────────────────
 * If the Playwright session fails (e.g. browser not available on Vercel), the
 * route returns { scanned: 0, errors: ["Browser session unavailable"] } instead
 * of throwing. This prevents cron failure alerts for a known missing capability.
 *
 * ── Dual-write + shared read (migration 0027, phase 3) ───────────────────
 * Writes: visibility_checks (personal history) + shared_visibility_scans
 * (public result) + visibility_watches (private "I track this").
 * Queue freshness reads shared_visibility_scans first so two tenants
 * watching the same SKU share one scrape clock. Personal history is the
 * fallback when no shared row exists.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const SCAN_DELAY_MS = 3_000;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse request body ──────────────────────────────────────────────────
  let userId: string;
  let marketplace: string;
  try {
    const body = (await req.json()) as { userId?: string; marketplace?: string };
    if (!body.userId || !body.marketplace) {
      return NextResponse.json(
        { error: "Request body must include { userId: string, marketplace: string }" },
        { status: 400 }
      );
    }
    userId = body.userId;
    marketplace = body.marketplace;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Supabase service-role client ────────────────────────────────────────
  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[cron/scan-visibility] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not configured.");
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  // ── Build scan queue from DB ────────────────────────────────────────────
  const batchSize = Math.min(
    Number(process.env.SCAN_BATCH_SIZE) || DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  // Fetch active SKUs for this user from user_transactions
  const { data: txRows, error: txError } = await supabase
    .from("user_transactions")
    .select("sku, category, gross_revenue, commission, vat, shipping, returns_allocated, ad_spend_allocated, payment_fees, packaging, cogs, product_name")
    .eq("user_id", userId)
    .eq("marketplace", marketplace);

  if (txError) {
    console.error("[cron/scan-visibility] failed to load user_transactions:", txError.message);
    return NextResponse.json({ error: "İşlem verileri okunamadı." }, { status: 500 });
  }

  if (!txRows || txRows.length === 0) {
    console.log(`[cron/scan-visibility] No SKUs found for user ${userId} on ${marketplace}.`);
    return NextResponse.json({ scanned: 0, found: 0, errors: [] });
  }

  // Build minimal SkuMargin array for queue (simplified from transaction rows)
  const skuMap = new Map<string, { grossRevenue: number; netContrib: number; category: string; returnsPct: number; isSilentLoser: boolean; productName: string | null }>();
  for (const row of txRows as Array<Record<string, unknown>>) {
    const sku = String(row.sku ?? "");
    const grossRevenue = Number(row.gross_revenue ?? 0);
    const cogs = Number(row.cogs ?? 0);
    const commission = Number(row.commission ?? 0);
    const vat = Number(row.vat ?? 0);
    const shipping = Number(row.shipping ?? 0);
    const returnsAllocated = Number(row.returns_allocated ?? 0);
    const adSpend = Number(row.ad_spend_allocated ?? 0);
    const paymentFees = Number(row.payment_fees ?? 0);
    const packaging = Number(row.packaging ?? 0);
    const totalFees = commission + vat + shipping + returnsAllocated + adSpend + paymentFees + packaging;
    const netContrib = grossRevenue - totalFees - cogs;

    const existing = skuMap.get(sku) ?? {
      grossRevenue: 0,
      netContrib: 0,
      category: String(row.category ?? ""),
      returnsPct: 0,
      isSilentLoser: false,
      productName: row.product_name ? String(row.product_name) : null,
    };
    existing.grossRevenue += grossRevenue;
    existing.netContrib += netContrib;
    // Use first non-null product_name encountered for this SKU
    if (!existing.productName && row.product_name) {
      existing.productName = String(row.product_name);
    }
    skuMap.set(sku, existing);
  }

  const skuMargins: SkuMargin[] = [];
  // Also track product names for use as search keywords
  const productNames = new Map<string, string>();
  for (const [sku, agg] of skuMap) {
    const trueMarginPct = agg.grossRevenue > 0 ? (agg.netContrib / agg.grossRevenue) * 100 : 0;
    const perceivedMarginPct = trueMarginPct; // simplified
    skuMargins.push({
      sku,
      category: agg.category,
      trueMarginPct,
      perceivedMarginPct,
      gapPct: 0,
      isSilentLoser: false,
      returnRatePct: 0,
      isReturnRisk: false,
    });
    if (agg.productName) productNames.set(sku, agg.productName);
  }

  // Shared scrape clock first; this user's visibility_checks as fallback.
  const skuList = skuMargins.map((s) => s.sku);
  const lastScans = await loadSharedLastScans(supabase, {
    marketplace,
    skus: skuList,
    userId,
  });

  const referenceTime = new Date();
  const validMarketplace = (marketplace === "trendyol" || marketplace === "hepsiburada" || marketplace === "n11")
    ? marketplace as "trendyol" | "hepsiburada" | "n11"
    : null;

  if (!validMarketplace) {
    return NextResponse.json({ error: `Unsupported marketplace: ${marketplace}` }, { status: 400 });
  }

  const queue = buildScanQueue({ skus: skuMargins, marketplace: validMarketplace, lastScans, referenceTime });
  const jobsToRun = queue.slice(0, batchSize);

  console.log(`[cron/scan-visibility] Queued ${queue.length} SKU(s), scanning top ${jobsToRun.length}.`);

  // ── Browser session ─────────────────────────────────────────────────────
  const session = await createBrowserSession();
  if (!session) {
    console.warn("[cron/scan-visibility] Browser session unavailable — Playwright not installed or failed to start.");
    return NextResponse.json({ scanned: 0, found: 0, errors: ["Browser session unavailable"] });
  }

  // ── Scan loop ───────────────────────────────────────────────────────────
  let scanned = 0;
  let found = 0;
  const errors: string[] = [];

  try {
    for (let i = 0; i < jobsToRun.length; i++) {
      const job = jobsToRun[i];
      console.log(`[cron/scan-visibility] Scanning SKU ${job.sku} on ${validMarketplace} (priority: ${job.priorityScore})`);

      try {
        const result = await searchProductRank(
          {
            marketplace: validMarketplace,
            // Use human-readable product name as keyword (0022 migration).
            // Falls back to SKU code when product_name is not yet populated
            // (rows synced before 0022 was applied).
            keyword: productNames.get(job.sku) ?? job.sku,
            targetTitle: productNames.get(job.sku) ?? job.sku,
            maxPages: 3,
          },
          session.page
        );

        scanned++;
        if (result.found) found++;

        const keyword = productNames.get(job.sku) ?? job.sku;

        const shared = await upsertSharedVisibilityScan(supabase, {
          marketplace: validMarketplace,
          keyword,
          sku: job.sku,
          rank: result.rank ?? null,
          page: result.page ?? null,
          isIndexed: result.isIndexed,
          isOnFirstPage: result.isOnFirstPage,
          searchResultCount: result.results.length,
        });
        if (shared.error) {
          console.warn(`[cron/scan-visibility] shared scan upsert skipped for ${job.sku}:`, shared.error);
        }

        const watch = await ensureVisibilityWatch(supabase, userId, {
          tenantId: userId,
          marketplace: validMarketplace,
          sku: job.sku,
          keyword,
        });
        if (watch.error) {
          console.warn(`[cron/scan-visibility] watch upsert skipped for ${job.sku}:`, watch.error);
        }

        const insertResult = await insertVisibilityCheck(supabase, userId, {
          tenantId: userId,
          marketplace: validMarketplace,
          sku: job.sku,
          keyword,
          rank: result.rank ?? null,
          page: result.page ?? null,
          isIndexed: result.isIndexed,
          isOnFirstPage: result.isOnFirstPage,
          searchResultCount: result.results.length,
          sharedScanId: shared.scanId,
        });

        if (insertResult.error) {
          console.error(`[cron/scan-visibility] Failed to save result for ${job.sku}:`, insertResult.error);
          errors.push(`Save failed for ${job.sku}: ${insertResult.error}`);
        } else {
          console.log(`[cron/scan-visibility] SKU ${job.sku}: found=${result.found}, rank=${result.rank ?? "not found"}`);
        }
      } catch (err) {
        const msg = `Error scanning ${job.sku}: ${String(err)}`;
        console.error("[cron/scan-visibility]", msg);
        errors.push(msg);
      }

      // 3-second delay between scans (rate limit guard)
      if (i < jobsToRun.length - 1) {
        await delay(SCAN_DELAY_MS);
      }
    }
  } finally {
    await session.close().catch(() => { /* ignore close errors */ });
  }

  console.log(`[cron/scan-visibility] Done: scanned=${scanned}, found=${found}, errors=${errors.length}`);
  return NextResponse.json({ scanned, found, errors });
}
