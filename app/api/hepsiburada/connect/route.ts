import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchHepsiburadaOrders, mapHepsiburadaOrdersToUserRawRows,
  HepsiburadaAuthError, HepsiburadaApiError, HepsiburadaMappingError,
} from "@/lib/hepsiburada-api/client";
import { validateUserRawRows } from "@/lib/domain/schemas";
import { encryptSecret } from "@/lib/security/crypto";
import { saveDedupedTransactions } from "@/lib/save-user-transactions";

/**
 * POST /api/hepsiburada/connect
 *
 * Same real-integration pattern as /api/trendyol/connect: takes a seller's
 * own Merchant ID / API Key / API Secret, calls Hepsiburada's live orders
 * API to BOTH validate the credentials and pull real recent orders in one
 * round trip. Only on a real success does it store the (encrypted)
 * credentials and save the mapped rows — a wrong key/secret returns the
 * exact 401 Hepsiburada gave us, and nothing is written.
 */

export const runtime = "nodejs";

interface ConnectRequestBody {
  merchantId?: string;
  apiKey?: string;
  apiSecret?: string;
}

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
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

  const merchantId = body.merchantId?.trim();
  const apiKey = body.apiKey?.trim();
  const apiSecret = body.apiSecret?.trim();
  if (!merchantId || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Merchant ID, API Kullanıcı Adı ve API Şifresi gerekli." }, { status: 400 });
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

  // 1) Hit Hepsiburada's REAL API, then map its response. Wrong credentials
  //    throw here (401/403) — nothing below runs. A schema mismatch
  //    (HepsiburadaMappingError) also aborts here instead of silently
  //    reporting a "successful" 0-row sync.
  let orders;
  let rawRows;
  try {
    orders = await fetchHepsiburadaOrders({ merchantId, apiKey, apiSecret });
    rawRows = mapHepsiburadaOrdersToUserRawRows(orders);
  } catch (err) {
    if (err instanceof HepsiburadaAuthError) {
      console.warn(`[hepsiburada/connect] Hepsiburada rejected credentials for merchant ${merchantId}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof HepsiburadaMappingError) {
      console.error(`[hepsiburada/connect] Hepsiburada response schema mismatch for merchant ${merchantId}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof HepsiburadaApiError) {
      console.error(`[hepsiburada/connect] Hepsiburada API error (status ${err.status}) for merchant ${merchantId}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[hepsiburada/connect] unexpected error contacting Hepsiburada:", err);
    return NextResponse.json({ error: "Hepsiburada'ya bağlanılamadı. Lütfen tekrar deneyin." }, { status: 502 });
  }

  // 2) Zod-validate the mapped rows before storage (defense-in-depth).
  const { valid: rows, warnings } = validateUserRawRows(rawRows);

  // 3) Persist encrypted credentials — reuses the same marketplace_credentials
  //    table Trendyol uses (upsert keyed on user_id + marketplace).
  //    encryptSecret throws if CREDENTIALS_ENCRYPTION_KEY isn't configured on
  //    this deployment — caught explicitly (see trendyol/connect for why).
  let apiKeyEncrypted: string;
  let apiSecretEncrypted: string;
  try {
    apiKeyEncrypted = encryptSecret(apiKey);
    apiSecretEncrypted = encryptSecret(apiSecret);
  } catch (err) {
    console.error("[hepsiburada/connect] failed to encrypt credentials (CREDENTIALS_ENCRYPTION_KEY missing?):", err);
    return NextResponse.json({ error: "Kimlik bilgileri şifrelenemedi — sunucu yapılandırması eksik." }, { status: 500 });
  }

  const { error: credError } = await supabase.from("marketplace_credentials").upsert(
    {
      user_id: userId,
      marketplace: "hepsiburada",
      seller_id: merchantId,
      api_key_encrypted: apiKeyEncrypted,
      api_secret_encrypted: apiSecretEncrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace" }
  );
  if (credError) {
    console.error("[hepsiburada/connect] failed to store credentials:", credError.message);
    return NextResponse.json({ error: "Kimlik bilgileri kaydedilemedi." }, { status: 500 });
  }

  // 4) Persist the real rows through the same table CSV/manual/Trendyol use —
  //    de-duplicated by order_id so reconnecting can never double-count an
  //    order already stored (see lib/save-user-transactions.ts).
  const saveResult = await saveDedupedTransactions(supabase, userId, "hepsiburada", rows);
  if (saveResult.error) {
    console.error("[hepsiburada/connect] failed to save rows:", saveResult.rawError ?? saveResult.error);
    return NextResponse.json({ error: saveResult.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    merchantId,
    ordersFetched: orders.length,
    rowsSaved: saveResult.rowsSaved,
    duplicatesSkipped: saveResult.duplicatesSkipped,
    warnings,
  });
}
