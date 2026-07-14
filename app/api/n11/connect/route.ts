import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchN11Orders, mapN11OrdersToUserRawRows, N11AuthError, N11ApiError, N11MappingError,
} from "@/lib/n11-api/client";
import { validateUserRawRows } from "@/lib/domain/schemas";
import { encryptSecret } from "@/lib/security/crypto";
import { saveDedupedTransactions } from "@/lib/save-user-transactions";

/**
 * POST /api/n11/connect
 *
 * Same real-integration pattern as /api/trendyol/connect and
 * /api/hepsiburada/connect: takes a seller's own App Key / App Secret, calls
 * N11's live shipmentPackages API to BOTH validate the credentials and pull
 * real recent orders in one round trip. Only on a real success does it store
 * the (encrypted) credentials and save the mapped rows — a wrong key/secret
 * returns the exact 401 N11 gave us, and nothing is written.
 */

export const runtime = "nodejs";

interface ConnectRequestBody {
  appKey?: string;
  appSecret?: string;
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

  const appKey = body.appKey?.trim();
  const appSecret = body.appSecret?.trim();
  if (!appKey || !appSecret) {
    return NextResponse.json({ error: "App Key ve App Secret gerekli." }, { status: 400 });
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

  // 1) Hit N11's REAL API, then map its response. Wrong credentials throw
  //    here (401/403) — nothing below runs. A schema mismatch
  //    (N11MappingError) also aborts here — especially important for N11
  //    given the low field-name confidence documented in client.ts.
  let orders;
  let rawRows;
  try {
    orders = await fetchN11Orders({ appKey, appSecret });
    rawRows = mapN11OrdersToUserRawRows(orders);
  } catch (err) {
    if (err instanceof N11AuthError) {
      console.warn(`[n11/connect] N11 rejected credentials: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof N11MappingError) {
      console.error(`[n11/connect] N11 response schema mismatch: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof N11ApiError) {
      console.error(`[n11/connect] N11 API error (status ${err.status}): ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[n11/connect] unexpected error contacting N11:", err);
    return NextResponse.json({ error: "N11'e bağlanılamadı. Lütfen tekrar deneyin." }, { status: 502 });
  }

  // 2) Zod-validate the mapped rows before storage (defense-in-depth).
  const { valid: rows, warnings } = validateUserRawRows(rawRows);

  // 3) Persist encrypted credentials — reuses the same marketplace_credentials
  //    table Trendyol/Hepsiburada use. N11 has no separate seller/merchant id
  //    from the client, so seller_id stores the app key's own identity ref.
  const { error: credError } = await supabase.from("marketplace_credentials").upsert(
    {
      user_id: userId,
      marketplace: "n11",
      seller_id: appKey,
      api_key_encrypted: encryptSecret(appKey),
      api_secret_encrypted: encryptSecret(appSecret),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace" }
  );
  if (credError) {
    console.error("[n11/connect] failed to store credentials:", credError.message);
    return NextResponse.json({ error: "Kimlik bilgileri kaydedilemedi." }, { status: 500 });
  }

  // 4) Persist the real rows through the same table CSV/manual/Trendyol/Hepsiburada
  //    use — de-duplicated by order_id so reconnecting can never double-count
  //    an order already stored (see lib/save-user-transactions.ts).
  const saveResult = await saveDedupedTransactions(supabase, userId, "n11", rows);
  if (saveResult.error) {
    console.error("[n11/connect] failed to save rows:", saveResult.rawError ?? saveResult.error);
    return NextResponse.json({ error: saveResult.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    ordersFetched: orders.length,
    rowsSaved: saveResult.rowsSaved,
    duplicatesSkipped: saveResult.duplicatesSkipped,
    warnings,
  });
}
