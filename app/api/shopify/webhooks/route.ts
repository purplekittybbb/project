import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  mapShopifyWebhookOrderToUserRawRows,
  ShopifyMappingError,
  verifyWebhookHmac,
} from "@/lib/shopify-api/client";
import { validateUserRawRows } from "@/lib/domain/schemas";
import { saveDedupedTransactions } from "@/lib/save-user-transactions";
import { recordSyncFailure, recordSyncSuccess } from "@/lib/marketplace-sync-status";

/**
 * POST /api/shopify/webhooks
 *
 * Shopify push notifications for near-real-time order sync + uninstall cleanup.
 * Topics (see shopify.app.toml):
 *   - orders/create, orders/updated → append new order lines (de-duped)
 *   - app/uninstalled → delete stored credentials for that shop
 *
 * Auth: X-Shopify-Hmac-Sha256 over the raw body (client secret). Rejects
 * before any DB work if the signature is missing/wrong. Uses the service-
 * role client (same pattern as cron) because webhooks are not a signed-in
 * user session — HMAC is the trust boundary.
 */

export const runtime = "nodejs";

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findShopifyCredential(
  supabase: SupabaseClient,
  shop: string
): Promise<{ user_id: string; seller_id: string } | null> {
  const { data, error } = await supabase
    .from("marketplace_credentials")
    .select("user_id, seller_id")
    .eq("marketplace", "shopify")
    .eq("seller_id", shop)
    .maybeSingle();
  if (error || !data) return null;
  return data as { user_id: string; seller_id: string };
}

export async function POST(req: Request) {
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientSecret) {
    console.error("[shopify/webhooks] SHOPIFY_CLIENT_SECRET is not configured.");
    return NextResponse.json({ error: "Shopify yapılandırılmamış." }, { status: 500 });
  }

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhookHmac(rawBody, hmacHeader, clientSecret)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shop = (req.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  if (!shop) {
    return NextResponse.json({ error: "Missing shop domain" }, { status: 400 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[shopify/webhooks] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not configured.");
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  if (topic === "app/uninstalled") {
    const { error } = await supabase
      .from("marketplace_credentials")
      .delete()
      .eq("marketplace", "shopify")
      .eq("seller_id", shop);
    if (error) {
      console.error(`[shopify/webhooks] failed to delete credentials for ${shop}:`, error.message);
      return NextResponse.json({ error: "Credential delete failed" }, { status: 500 });
    }
    console.log(`[shopify/webhooks] app/uninstalled — removed credentials for ${shop}`);
    return NextResponse.json({ ok: true, topic, action: "credentials_deleted" });
  }

  if (topic !== "orders/create" && topic !== "orders/updated") {
    // Acknowledge unknown topics so Shopify doesn't retry forever.
    return NextResponse.json({ ok: true, topic, action: "ignored" });
  }

  const cred = await findShopifyCredential(supabase, shop);
  if (!cred) {
    // Shop not linked in our DB — acknowledge so Shopify stops retrying.
    console.warn(`[shopify/webhooks] ${topic} for unknown shop ${shop} — no credentials on file`);
    return NextResponse.json({ ok: true, topic, action: "no_credential" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let rawRows;
  try {
    rawRows = mapShopifyWebhookOrderToUserRawRows(payload);
  } catch (err) {
    const message = err instanceof ShopifyMappingError ? err.message : "Webhook siparişi işlenemedi.";
    await recordSyncFailure(supabase, cred.user_id, "shopify", message, false);
    console.error(`[shopify/webhooks] mapping failed for ${shop}:`, message);
    // 200 so Shopify doesn't hammer retries on a permanently bad payload shape
    // for a line with no SKU — we still recorded the failure for the seller.
    return NextResponse.json({ ok: true, topic, action: "mapping_skipped", error: message });
  }

  const { valid: rows, warnings } = validateUserRawRows(rawRows);
  if (warnings.length > 0) {
    console.warn(`[shopify/webhooks] ${warnings.length} row(s) dropped for ${shop}:`, warnings);
  }

  const saveResult = await saveDedupedTransactions(supabase, cred.user_id, "shopify", rows);
  if (saveResult.error) {
    await recordSyncFailure(supabase, cred.user_id, "shopify", saveResult.error, false);
    console.error(`[shopify/webhooks] save failed for ${shop}:`, saveResult.rawError ?? saveResult.error);
    return NextResponse.json({ error: saveResult.error }, { status: 500 });
  }

  await recordSyncSuccess(supabase, cred.user_id, "shopify");
  return NextResponse.json({
    ok: true,
    topic,
    action: "synced",
    rowsSaved: saveResult.rowsSaved,
    duplicatesSkipped: saveResult.duplicatesSkipped,
  });
}
