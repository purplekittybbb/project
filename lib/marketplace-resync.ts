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
import type { UserRawRow } from "./adapters/csv";
import {
  fetchTrendyolOrders, mapOrdersToUserRawRows,
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
 * "Refresh" click AND from the hourly cron (app/api/cron/sync-marketplaces),
 * which may run concurrently with, or shortly after, a manual refresh, and
 * WILL run again and again on the same account every hour forever — it must
 * be safe to call repeatedly without ever inserting the same order twice.
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
    return { success: false, marketplace, authError: false, error: "Kayıtlı kimlik bilgisi bulunamadı — lütfen yeniden bağlanın." };
  }

  const cred = credRow as CredentialRow;
  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decryptSecret(cred.api_key_encrypted);
    apiSecret = decryptSecret(cred.api_secret_encrypted);
  } catch (err) {
    console.error(`[resyncMarketplace] failed to decrypt stored credentials for ${marketplace}:`, err);
    return { success: false, marketplace, authError: false, error: "Kayıtlı kimlik bilgisi çözümlenemedi." };
  }
  const sellerId = cred.seller_id;

  let ordersFetched: number;
  let rawRows: UserRawRow[];
  try {
    if (marketplace === "trendyol") {
      const orders = await fetchTrendyolOrders({ sellerId, apiKey, apiSecret });
      ordersFetched = orders.length;
      rawRows = mapOrdersToUserRawRows(orders);
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
    return { success: false, marketplace, authError, error: message };
  }

  const { valid: rows, warnings } = validateUserRawRows(rawRows);
  if (warnings.length > 0) {
    console.warn(`[resyncMarketplace] ${warnings.length} row(s) dropped for ${marketplace}:`, warnings);
  }

  // De-dupe by order_id against what's already stored for this user+marketplace
  // BEFORE inserting anything — this is the idempotency guarantee the hourly
  // cron depends on. (There's no DB-level unique constraint on order_id today;
  // see supabase/migrations/0003_user_transactions_dedupe_index.sql for an
  // optional, DB-enforced second layer — this app-level check is the one that
  // always works, with or without that migration applied.)
  const { data: existingRows, error: existingError } = await supabase
    .from("user_transactions")
    .select("order_id")
    .eq("user_id", userId)
    .eq("marketplace", marketplace);
  if (existingError) {
    console.error(`[resyncMarketplace] failed to read existing ${marketplace} rows for de-dupe:`, existingError.message);
    return { success: false, marketplace, authError: false, error: "Mevcut veriler okunamadı." };
  }
  const existingOrderIds = new Set((existingRows ?? []).map((r) => (r as { order_id: string }).order_id));
  const newRows = rows.filter((r) => !existingOrderIds.has(r.order_id));
  const duplicatesSkipped = rows.length - newRows.length;

  if (newRows.length > 0) {
    const payload = newRows.map((r) => ({
      user_id: userId,
      order_id: r.order_id,
      sku: r.sku,
      category: r.category,
      sale_date: r.sale_date,
      units: r.units,
      gross_revenue: r.gross_revenue,
      unit_cost: r.unit_cost,
      shipping: r.shipping,
      return_rate: r.return_rate,
      ad_spend: r.ad_spend,
      marketplace: r.marketplace,
    }));
    const { error: insertError } = await supabase.from("user_transactions").insert(payload);
    if (insertError) {
      console.error(`[resyncMarketplace] failed to save ${marketplace} rows:`, insertError.message);
      return { success: false, marketplace, authError: false, error: "Veriler kaydedilemedi." };
    }
  }

  return { success: true, marketplace, ordersFetched, rowsSaved: newRows.length, duplicatesSkipped };
}
