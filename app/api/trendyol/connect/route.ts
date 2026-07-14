import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchTrendyolOrders, mapOrdersToUserRawRows, TrendyolAuthError, TrendyolApiError, TrendyolMappingError,
} from "@/lib/trendyol-api/client";
import { validateUserRawRows } from "@/lib/domain/schemas";
import { encryptSecret } from "@/lib/security/crypto";
import { saveDedupedTransactions } from "@/lib/save-user-transactions";

/**
 * POST /api/trendyol/connect
 *
 * Real Trendyol connect: takes a seller's own Seller ID / API Key / API
 * Secret, calls Trendyol's live Orders API to BOTH validate the credentials
 * and pull real recent orders in one round trip. Only on a real success does
 * it store the (encrypted) credentials and save the mapped rows — a wrong
 * key/secret returns the exact 401 Trendyol gave us, and nothing is written.
 */

export const runtime = "nodejs";

interface ConnectRequestBody {
  sellerId?: string;
  apiKey?: string;
  apiSecret?: string;
}

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  // Forwarding the caller's own access token (not the service role) means
  // every query below still runs under Postgres RLS as that user — no
  // elevated privileges are used to read or write on their behalf.
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  let body: ConnectRequestBody;
  try {
    body = (await req.json()) as ConnectRequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const sellerId = body.sellerId?.trim();
  const apiKey = body.apiKey?.trim();
  const apiSecret = body.apiSecret?.trim();
  if (!sellerId || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Seller ID, API Key ve API Secret gerekli." }, { status: 400 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz — lütfen tekrar giriş yapın." }, { status: 401 });
  }
  const userId = userData.user.id;

  // 1) Hit Trendyol's REAL API, then map its response. Wrong credentials
  //    throw here (401/403) — nothing below runs, and the client never sees
  //    a fake "Connected". A schema mismatch (TrendyolMappingError) also
  //    aborts here instead of silently reporting a "successful" 0-row sync —
  //    see TrendyolMappingError's doc comment for why that distinction matters.
  let orders;
  let rawRows;
  try {
    orders = await fetchTrendyolOrders({ sellerId, apiKey, apiSecret });
    rawRows = mapOrdersToUserRawRows(orders);
  } catch (err) {
    if (err instanceof TrendyolAuthError) {
      console.warn(`[trendyol/connect] Trendyol rejected credentials for seller ${sellerId}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof TrendyolMappingError) {
      console.error(`[trendyol/connect] Trendyol response schema mismatch for seller ${sellerId}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof TrendyolApiError) {
      console.error(`[trendyol/connect] Trendyol API error (status ${err.status}) for seller ${sellerId}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[trendyol/connect] unexpected error contacting Trendyol:", err);
    return NextResponse.json({ error: "Trendyol'a bağlanılamadı. Lütfen tekrar deneyin." }, { status: 502 });
  }

  // 2) Zod-validate the mapped rows before storage (defense-in-depth).
  const { valid: rows, warnings } = validateUserRawRows(rawRows);

  // 3) Persist encrypted credentials (upsert — reconnecting just refreshes them).
  //    encryptSecret throws if CREDENTIALS_ENCRYPTION_KEY isn't configured on
  //    this deployment — caught explicitly so that misconfiguration produces
  //    a clear, logged, attributable failure instead of an unhandled
  //    exception surfacing as an opaque 500 indistinguishable from any other
  //    server error.
  let apiKeyEncrypted: string;
  let apiSecretEncrypted: string;
  try {
    apiKeyEncrypted = encryptSecret(apiKey);
    apiSecretEncrypted = encryptSecret(apiSecret);
  } catch (err) {
    console.error("[trendyol/connect] failed to encrypt credentials (CREDENTIALS_ENCRYPTION_KEY missing?):", err);
    return NextResponse.json({ error: "Kimlik bilgileri şifrelenemedi — sunucu yapılandırması eksik." }, { status: 500 });
  }

  const { error: credError } = await supabase.from("marketplace_credentials").upsert(
    {
      user_id: userId,
      marketplace: "trendyol",
      seller_id: sellerId,
      api_key_encrypted: apiKeyEncrypted,
      api_secret_encrypted: apiSecretEncrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace" }
  );
  if (credError) {
    console.error("[trendyol/connect] failed to store credentials:", credError.message);
    return NextResponse.json({ error: "Kimlik bilgileri kaydedilemedi." }, { status: 500 });
  }

  // 4) Persist the real rows through the same table CSV/manual entry uses —
  //    de-duplicated by order_id so reconnecting (e.g. after "Disconnect only
  //    — keep my data") can never double-count an order already stored.
  const saveResult = await saveDedupedTransactions(supabase, userId, "trendyol", rows);
  if (saveResult.error) {
    console.error("[trendyol/connect] failed to save rows:", saveResult.rawError ?? saveResult.error);
    return NextResponse.json({ error: saveResult.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    sellerId,
    ordersFetched: orders.length,
    rowsSaved: saveResult.rowsSaved,
    duplicatesSkipped: saveResult.duplicatesSkipped,
    warnings,
  });
}
