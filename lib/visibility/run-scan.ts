/**
 * Shared visibility-scan core.
 *
 * Extracted from app/api/cron/scan-visibility so BOTH the scheduled cron and a
 * user-triggered scan (app/api/visibility/scan — the "Görünürlüğü tara" button)
 * run the exact same logic: load the user's SKUs, build a freshness-aware scan
 * queue, scrape marketplace search rank with anti-bot delays, and dual-write
 * visibility_checks + shared_visibility_scans + visibility_watches.
 *
 * Never throws for an operational failure (browser unavailable, per-SKU scrape
 * error) — returns a structured result so callers can report gracefully.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
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

export const VISIBILITY_SCAN_DELAY_MS = 3_000;
export const VISIBILITY_DEFAULT_BATCH = 5;
export const VISIBILITY_MAX_BATCH = 10;

export interface VisibilityScanResult {
  scanned: number;
  found: number;
  errors: string[];
  /** true when there were SKUs but none were due for a re-scan (all fresh). */
  nothingDue?: boolean;
  /** true when the marketplace has no live scraper. */
  unsupported?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a visibility scan for one user + marketplace using a service-role client.
 * The caller is responsible for having authenticated the user and for passing a
 * service-role Supabase client (needed to write the shared + personal tables).
 */
export async function runVisibilityScan(
  supabase: SupabaseClient,
  opts: { userId: string; marketplace: string; batchSize?: number },
): Promise<VisibilityScanResult> {
  const { userId, marketplace } = opts;
  const batchSize = Math.min(
    opts.batchSize || Number(process.env.SCAN_BATCH_SIZE) || VISIBILITY_DEFAULT_BATCH,
    VISIBILITY_MAX_BATCH,
  );

  const validMarketplace =
    marketplace === "trendyol" || marketplace === "hepsiburada" || marketplace === "n11"
      ? (marketplace as "trendyol" | "hepsiburada" | "n11")
      : null;
  if (!validMarketplace) {
    return { scanned: 0, found: 0, errors: [`Unsupported marketplace: ${marketplace}`], unsupported: true };
  }

  const { data: txRows, error: txError } = await supabase
    .from("user_transactions")
    .select("sku, category, gross_revenue, commission, vat, shipping, returns_allocated, ad_spend_allocated, payment_fees, packaging, cogs, product_name")
    .eq("user_id", userId)
    .eq("marketplace", marketplace);

  if (txError) {
    return { scanned: 0, found: 0, errors: [`user_transactions read failed: ${txError.message}`] };
  }
  if (!txRows || txRows.length === 0) {
    return { scanned: 0, found: 0, errors: [] };
  }

  const skuMap = new Map<string, { grossRevenue: number; netContrib: number; category: string; productName: string | null }>();
  for (const row of txRows as Array<Record<string, unknown>>) {
    const sku = String(row.sku ?? "");
    const grossRevenue = Number(row.gross_revenue ?? 0);
    const cogs = Number(row.cogs ?? 0);
    const totalFees =
      Number(row.commission ?? 0) + Number(row.vat ?? 0) + Number(row.shipping ?? 0) +
      Number(row.returns_allocated ?? 0) + Number(row.ad_spend_allocated ?? 0) +
      Number(row.payment_fees ?? 0) + Number(row.packaging ?? 0);
    const netContrib = grossRevenue - totalFees - cogs;
    const existing = skuMap.get(sku) ?? {
      grossRevenue: 0, netContrib: 0,
      category: String(row.category ?? ""),
      productName: row.product_name ? String(row.product_name) : null,
    };
    existing.grossRevenue += grossRevenue;
    existing.netContrib += netContrib;
    if (!existing.productName && row.product_name) existing.productName = String(row.product_name);
    skuMap.set(sku, existing);
  }

  const skuMargins: SkuMargin[] = [];
  const productNames = new Map<string, string>();
  for (const [sku, agg] of skuMap) {
    const trueMarginPct = agg.grossRevenue > 0 ? (agg.netContrib / agg.grossRevenue) * 100 : 0;
    skuMargins.push({
      sku, category: agg.category,
      trueMarginPct, perceivedMarginPct: trueMarginPct,
      gapPct: 0, isSilentLoser: false, returnRatePct: 0, isReturnRisk: false,
      netContribution: agg.netContrib,
    });
    if (agg.productName) productNames.set(sku, agg.productName);
  }

  const lastScans = await loadSharedLastScans(supabase, {
    marketplace: validMarketplace,
    skus: skuMargins.map((s) => s.sku),
    userId,
  });

  const queue = buildScanQueue({ skus: skuMargins, marketplace: validMarketplace, lastScans, referenceTime: new Date() });
  const jobsToRun = queue.slice(0, batchSize);
  if (jobsToRun.length === 0) {
    return { scanned: 0, found: 0, errors: [], nothingDue: true };
  }

  const session = await createBrowserSession();
  if (!session) {
    return { scanned: 0, found: 0, errors: ["Browser session unavailable"] };
  }

  let scanned = 0;
  let found = 0;
  const errors: string[] = [];
  try {
    for (let i = 0; i < jobsToRun.length; i++) {
      const job = jobsToRun[i];
      const keyword = productNames.get(job.sku) ?? job.sku;
      try {
        const result = await searchProductRank(
          { marketplace: validMarketplace, keyword, targetTitle: keyword, maxPages: 3 },
          session.page,
        );
        scanned++;
        if (result.found) found++;

        const shared = await upsertSharedVisibilityScan(supabase, {
          marketplace: validMarketplace, keyword, sku: job.sku,
          rank: result.rank ?? null, page: result.page ?? null,
          isIndexed: result.isIndexed, isOnFirstPage: result.isOnFirstPage,
          searchResultCount: result.results.length,
        });
        await ensureVisibilityWatch(supabase, userId, {
          tenantId: userId, marketplace: validMarketplace, sku: job.sku, keyword,
        });
        const insertResult = await insertVisibilityCheck(supabase, userId, {
          tenantId: userId, marketplace: validMarketplace, sku: job.sku, keyword,
          rank: result.rank ?? null, page: result.page ?? null,
          isIndexed: result.isIndexed, isOnFirstPage: result.isOnFirstPage,
          searchResultCount: result.results.length, sharedScanId: shared.scanId,
        });
        if (insertResult.error) errors.push(`Save failed for ${job.sku}: ${insertResult.error}`);
      } catch (err) {
        errors.push(`Error scanning ${job.sku}: ${String(err)}`);
      }
      if (i < jobsToRun.length - 1) await delay(VISIBILITY_SCAN_DELAY_MS);
    }
  } finally {
    await session.close().catch(() => { /* ignore */ });
  }

  return { scanned, found, errors };
}
