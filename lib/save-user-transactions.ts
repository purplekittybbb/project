import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRawRow } from "./adapters/csv";

export interface SaveDedupedResult {
  /** Friendly Turkish message for the caller to surface — null on success. */
  error: string | null;
  /** Raw Supabase error text, for the caller to log server-side (never shown to the user). */
  rawError?: string;
  rowsSaved: number;
  /** Rows the vendor returned again that this user already had stored — proof this run didn't duplicate anything. */
  duplicatesSkipped: number;
}

/**
 * Insert real marketplace rows for one user, de-duplicated by order_id
 * against whatever is already stored for this user+marketplace.
 *
 * Shared by every FIRST-connect route (Trendyol/Hepsiburada/N11's
 * /api/{marketplace}/connect, and /api/shopify/oauth/callback) AND
 * lib/marketplace-resync.ts's resyncMarketplace (manual "Refresh" + the
 * hourly cron) — originally only resyncMarketplace had this de-dupe; the
 * connect routes did a raw `.insert()`. That meant disconnecting a real
 * marketplace with "keep my data" (the non-destructive, most natural choice
 * in the disconnect dialog) and then reconnecting — same or different
 * credentials, same store — re-fetched and re-inserted the same recent
 * orders under the same order_ids, silently DOUBLING every affected order's
 * contribution to this user's revenue/margin numbers. Confirmed by code
 * review, not yet hit by a real account only because no one had reconnected
 * a live marketplace yet.
 *
 * Append-only: existing rows are never deleted or modified here. A vendor's
 * orders API only returns a recent window (see MAX_PAGES/`days` in each
 * client), so a delete-then-replace strategy would silently lose older
 * orders that fell outside that window on a later connect/resync — the same
 * reasoning resyncMarketplace's original de-dupe comment already documented.
 */
export async function saveDedupedTransactions(
  supabase: SupabaseClient,
  userId: string,
  marketplace: string,
  rows: UserRawRow[]
): Promise<SaveDedupedResult> {
  // Always check for a de-dupe read failure, even with zero incoming rows —
  // a broken read must never be silently reported as "success, 0 saved"
  // just because this particular sync also happened to fetch nothing new.
  const { data: existingRows, error: existingError } = await supabase
    .from("user_transactions")
    .select("order_id")
    .eq("user_id", userId)
    .eq("marketplace", marketplace);
  if (existingError) {
    return { error: "Mevcut veriler okunamadı.", rawError: existingError.message, rowsSaved: 0, duplicatesSkipped: 0 };
  }

  const existingOrderIds = new Set((existingRows ?? []).map((r) => (r as { order_id: string }).order_id));
  const newRows = rows.filter((r) => !existingOrderIds.has(r.order_id));
  const duplicatesSkipped = rows.length - newRows.length;
  if (newRows.length === 0) {
    return { error: null, rowsSaved: 0, duplicatesSkipped };
  }

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
    return { error: "Veriler kaydedilemedi.", rawError: insertError.message, rowsSaved: 0, duplicatesSkipped };
  }
  return { error: null, rowsSaved: newRows.length, duplicatesSkipped };
}
