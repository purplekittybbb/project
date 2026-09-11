/**
 * Shared "resync" logic — the missing read side of `marketplace_credentials`.
 *
 * Every /api/{trendyol,hepsiburada,n11}/connect route (and the Shopify OAuth
 * callback) WRITES encrypted credentials to `marketplace_credentials` on a
 * successful connect, but until now nothing ever READ them back — the table
 * was write-only. This module reads a user's stored credentials, decrypts
 * them server-side, hits the platform's real API again, and refreshes
 * `user_transactions` — enabling:
 *
 *  - /connect: silently reconnecting a returning user who has credentials on
 *    file but no data (e.g. after "Clear", or a fresh sign-in) — no form.
 *  - the dashboard's per-marketplace "Refresh" button — manual re-sync.
 *
 * Node-only (imports lib/security/crypto, which needs CREDENTIALS_ENCRYPTION_KEY)
 * — import only from server code (API routes), never from a "use client" file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./security/crypto";
import { validateUserRawRows } from "./domain/schemas";
import { saveDedupedTransactions } from "./save-user-transactions";
import type { UserRawRow } from "./adapters/csv";
import {
  fetchTrendyolOrders, fetchTrendyolProductCategoryIndex, mapOrdersToUserRawRows,
  TrendyolAuthError, TrendyolApiError, TrendyolMappingError,
} from "./trendyol-api/client";
import {
  fetchHepsiburadaOrders, mapHepsiburadaOrdersToUserRawRows,
  HepsiburadaAuthError, HepsiburadaApiError, HepsiburadaMappingError,
} from "./hepsiburada-api/client";
import {
  fetchN11Orders, mapN11OrdersToUserRawRows,
  N11AuthError, N11ApiError, N11MappingError,
} from "./n11-api/client";
import {
  fetchShopifyOrders, mapShopifyOrdersToUserRawRows,
  ShopifyAuthError, ShopifyApiError, ShopifyMappingError,
} from "./shopify-api/client";
import { recordSyncFailure, recordSyncSuccess } from "./marketplace-sync-status";
// Post-sync insight recording (alarm + profit history + demand estimates).
// All are wrapped in a try-catch so a DB or logic failure NEVER blocks the
// resync result itself.
import { toCanonicalForMarketplace } from "./supabase/user-data";
import { detectLossAlarms } from "./calc/loss-alarm";
import { perSkuMargins, aggregateTrueMargin } from "./domain/margin-engine";
import { insertLossAlarms } from "./supabase/loss-alarms";
import { insertProfitCalc } from "./supabase/profit-history";
import { estimateDemand } from "./demand/signals";
import { insertDemandEstimate } from "./supabase/demand-estimates";
import { rebuildUserCanonicalProducts } from "./tools/barcode-sync";

/** Marketplaces resyncMarketplace knows how to re-fetch from stored credentials. */
export const RESYNCABLE_MARKETPLACES = ["trendyol", "hepsiburada", "n11", "shopify"] as const;
export type ResyncableMarketplace = (typeof RESYNCABLE_MARKETPLACES)[number];

export function isResyncableMarketplace(id: string): id is ResyncableMarketplace {
  return (RESYNCABLE_MARKETPLACES as readonly string[]).includes(id);
}

export interface ResyncSuccess {
  success: true;
  marketplace: ResyncableMarketplace;
  ordersFetched: number;
  /** Newly inserted rows — never counts an order this user already had. */
  rowsSaved: number;
  /** Orders the vendor returned again that were already in user_transactions — proof this run didn't duplicate anything. */
  duplicatesSkipped: number;
}

export interface ResyncFailure {
  success: false;
  marketplace: string;
  /** True when the platform itself rejected the stored credentials (401/403)
   *  — the caller should fall back to a reconnect form, not just retry later. */
  authError: boolean;
  error: string;
}

export type ResyncResult = ResyncSuccess | ResyncFailure;

interface CredentialRow {
  marketplace: string;
  seller_id: string;
  api_key_encrypted: string;
  api_secret_encrypted: string;
}

/**
 * Re-fetch this user's real order data for one marketplace using their
 * already-stored (encrypted) credentials — no form, no re-entered key.
 *
 * Append-only + de-duplicated by order_id: this is called both from a manual
 * "Refresh" click AND from the scheduled cron (app/api/cron/sync-marketplaces),
 * which may run concurrently with, or shortly after, a manual refresh, and
 * WILL run again and again on the same account on schedule forever — it must
 * be safe to call repeatedly without ever inserting the same order twice.
 * Each outcome also updates last_synced_at / last_sync_error / needs_reauth
 * on marketplace_credentials (see lib/marketplace-sync-status.ts).
 * Existing rows are never touched or deleted: a vendor's orders API only
 * returns a recent window (see MAX_PAGES/`days` in each client) and a
 * delete-then-replace strategy would silently lose older orders that fell
 * outside that window on a later sync — append-only avoids that entirely.
 */
export async function resyncMarketplace(
  supabase: SupabaseClient,
  userId: string,
  marketplace: string
): Promise<ResyncResult> {
  if (!isResyncableMarketplace(marketplace)) {
    return { success: false, marketplace, authError: false, error: `Bilinmeyen pazar yeri: ${marketplace}` };
  }

  const { data: credRow, error: credFetchError } = await supabase
    .from("marketplace_credentials")
    .select("marketplace, seller_id, api_key_encrypted, api_secret_encrypted")
    .eq("user_id", userId)
    .eq("marketplace", marketplace)
    .maybeSingle();

  if (credFetchError || !credRow) {
    return {
      success: false,
      marketplace,
      authError: false,
      error: "Kayıtlı kimlik bilgisi bulunamadı — lütfen yeniden bağlanın.",
    };
  }

  const cred = credRow as CredentialRow;
  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decryptSecret(cred.api_key_encrypted);
    apiSecret = decryptSecret(cred.api_secret_encrypted);
  } catch (err) {
    console.error(`[resyncMarketplace] failed to decrypt stored credentials for ${marketplace}:`, err);
    const error = "Kayıtlı kimlik bilgisi çözümlenemedi.";
    await recordSyncFailure(supabase, userId, marketplace, error, false);
    return { success: false, marketplace, authError: false, error };
  }
  const sellerId = cred.seller_id;

  let ordersFetched: number;
  let rawRows: UserRawRow[];
  try {
    if (marketplace === "trendyol") {
      const creds = { sellerId, apiKey, apiSecret };
      const orders = await fetchTrendyolOrders(creds);
      ordersFetched = orders.length;
      const catalog = await fetchTrendyolProductCategoryIndex(creds);
      rawRows = mapOrdersToUserRawRows(orders, catalog);
    } else if (marketplace === "hepsiburada") {
      const orders = await fetchHepsiburadaOrders({ merchantId: sellerId, apiKey, apiSecret });
      ordersFetched = orders.length;
      rawRows = mapHepsiburadaOrdersToUserRawRows(orders);
    } else if (marketplace === "n11") {
      const orders = await fetchN11Orders({ appKey: apiKey, appSecret: apiSecret });
      ordersFetched = orders.length;
      rawRows = mapN11OrdersToUserRawRows(orders);
    } else {
      // shopify — sellerId is the shop domain, apiKey is the OAuth access token.
      const orders = await fetchShopifyOrders(sellerId, apiKey);
      ordersFetched = orders.length;
      rawRows = mapShopifyOrdersToUserRawRows(orders);
    }
  } catch (err) {
    const authError =
      err instanceof TrendyolAuthError || err instanceof HepsiburadaAuthError ||
      err instanceof N11AuthError || err instanceof ShopifyAuthError;
    const known =
      authError ||
      err instanceof TrendyolMappingError || err instanceof TrendyolApiError ||
      err instanceof HepsiburadaMappingError || err instanceof HepsiburadaApiError ||
      err instanceof N11MappingError || err instanceof N11ApiError ||
      err instanceof ShopifyMappingError || err instanceof ShopifyApiError;
    const message = known ? (err as Error).message : `${marketplace} adresine bağlanılamadı. Lütfen tekrar deneyin.`;

    if (authError) {
      console.warn(`[resyncMarketplace] ${marketplace} rejected stored credentials on resync: ${message}`);
    } else {
      console.error(`[resyncMarketplace] ${marketplace} resync failed:`, err);
    }
    await recordSyncFailure(supabase, userId, marketplace, message, authError);
    return { success: false, marketplace, authError, error: message };
  }

  const { valid: rows, warnings } = validateUserRawRows(rawRows);
  if (warnings.length > 0) {
    console.warn(`[resyncMarketplace] ${warnings.length} row(s) dropped for ${marketplace}:`, warnings);
  }

  // De-dupe by order_id against what's already stored for this user+marketplace
  // BEFORE inserting anything — this is the idempotency guarantee the cron
  // depends on. (There's no DB-level unique constraint on order_id today;
  // see supabase/migrations/0003_user_transactions_dedupe_index.sql for an
  // optional, DB-enforced second layer — this app-level check is the one that
  // always works, with or without that migration applied.) Shared with every
  // FIRST-connect route too — see lib/save-user-transactions.ts's doc comment
  // for why that mattered (reconnecting used to silently duplicate orders).
  const saveResult = await saveDedupedTransactions(supabase, userId, marketplace, rows);
  if (saveResult.error) {
    console.error(`[resyncMarketplace] failed to save ${marketplace} rows:`, saveResult.rawError ?? saveResult.error);
    await recordSyncFailure(supabase, userId, marketplace, saveResult.error, false);
    return { success: false, marketplace, authError: false, error: saveResult.error };
  }

  await recordSyncSuccess(supabase, userId, marketplace);

  // ── Post-sync insight recording (non-blocking) ──────────────────────────
  // Build canonical Transactions from the freshly validated rows, detect any
  // loss alarms for this batch, record a profit-calculation snapshot, and
  // compute per-SKU demand estimates from the observed sales velocity.
  // Runs after the main resync succeeds; any failure here is logged but never
  // propagates to the caller so the resync result is always authoritative.
  try {
    const txs = toCanonicalForMarketplace(userId, marketplace, rows);
    if (txs.length > 0) {
      const alarms = detectLossAlarms(perSkuMargins(txs));
      if (alarms.length > 0) {
        const { error: alarmErr } = await insertLossAlarms(supabase, userId, userId, marketplace, alarms);
        if (alarmErr) console.warn(`[resyncMarketplace] alarm insert soft-fail for ${marketplace}:`, alarmErr);
      }

      const agg = aggregateTrueMargin(txs);
      const { error: histErr } = await insertProfitCalc(supabase, userId, {
        tenantId: userId,
        marketplace,
        currency: txs[0]!.currency,
        grossRevenue: agg.grossRevenue,
        netProfit: agg.netContribution,
        netMarginPct: agg.marginPct,
        totalDeductions: agg.totalFees,
        breakdown: {},
      });
      if (histErr) console.warn(`[resyncMarketplace] profit-history insert soft-fail for ${marketplace}:`, histErr);

      // ── Demand estimates: one snapshot per SKU ─────────────────────────
      // Group transactions by SKU; compute daily sales velocity from the
      // observed date range and total units, then run estimateDemand().
      const bySku = new Map<string, typeof txs>();
      for (const tx of txs) {
        const arr = bySku.get(tx.sku) ?? [];
        arr.push(tx);
        bySku.set(tx.sku, arr);
      }

      for (const [sku, skuTxs] of bySku) {
        try {
          const totalUnits = skuTxs.reduce((s, t) => s + t.units, 0);
          // Compute observed date span (min 1 day to avoid division by zero)
          const timestamps = skuTxs.map((t) => new Date(t.saleDate).getTime());
          const minTs = Math.min(...timestamps);
          const maxTs = Math.max(...timestamps);
          const dataDays = Math.max(1, Math.round((maxTs - minTs) / 86_400_000));
          const dailySalesRate = totalUnits / dataDays;

          const estimate = estimateDemand({
            stockDelta: { dailySalesRate, dataDays },
          });

          const { error: demandErr } = await insertDemandEstimate(
            supabase, userId, userId, marketplace, sku, estimate,
          );
          if (demandErr) {
            console.warn(`[resyncMarketplace] demand-estimate insert soft-fail for ${marketplace}/${sku}:`, demandErr);
          }
        } catch (skuErr) {
          // Never let one SKU's failure break the others
          console.warn(`[resyncMarketplace] demand estimation threw for ${sku}:`, skuErr);
        }
      }
    }

    // Full-user barcode/canonical rebuild (uses all marketplaces, not just this batch).
    const canon = await rebuildUserCanonicalProducts(supabase, userId);
    if (canon.error) {
      console.warn(`[resyncMarketplace] canonical barcode rebuild soft-fail for ${marketplace}:`, canon.error);
    }
  } catch (err) {
    console.warn(`[resyncMarketplace] post-sync insight recording threw for ${marketplace}:`, err);
  }

  return {
    success: true,
    marketplace,
    ordersFetched,
    rowsSaved: saveResult.rowsSaved,
    duplicatesSkipped: saveResult.duplicatesSkipped,
  };
}
