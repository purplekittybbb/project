import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildUserSeller } from "@/lib/supabase/user-data";
import { deriveUnderwritingInputsFromTransactions } from "@/lib/data/seed";
import { trueMarginModel } from "@/lib/domain/underwriting";
import type { Currency } from "@/lib/domain/canonical";

/**
 * POST /api/ledger/record
 *
 * The real, per-user replacement for the in-memory decision ledger — see
 * supabase/migrations/0004_decision_ledger.sql for the append-only table this
 * writes to. Never trusts client-sent numbers: the decision is re-derived
 * server-side straight from the signed-in user's OWN `user_transactions`
 * (same formula app/api/chat/route.ts and lib/engine.ts's getFinancing use for
 * a runtime seller — trailing contribution, volatility, tenure).
 *
 * Idempotent by design: if the freshly computed decision is identical
 * (approved limit, take-rate, currency) to the user's most recent ledger row,
 * nothing is written — the dashboard calls this after every data-changing
 * action (initial load, CSV upload, resync, delete, clear), and most of those
 * calls should NOT create a new "decision" if nothing about the underwriting
 * inputs actually changed. A new row means the decision genuinely moved.
 */

export const runtime = "nodejs";

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

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz — lütfen tekrar giriş yapın." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: rows, error: rowsError } = await supabase
    .from("user_transactions")
    .select("order_id, sku, category, sale_date, units, gross_revenue, unit_cost, shipping, return_rate, ad_spend, marketplace");
  if (rowsError) {
    return NextResponse.json({ error: "Veriler okunamadı." }, { status: 502 });
  }

  const userRawRows = (rows ?? []).map((r) => ({
    order_id: (r as { order_id: string }).order_id,
    sku: (r as { sku: string }).sku,
    category: (r as { category: string }).category,
    sale_date: String((r as { sale_date: string }).sale_date).slice(0, 10),
    units: Number((r as { units: number }).units),
    gross_revenue: Number((r as { gross_revenue: number }).gross_revenue),
    unit_cost: Number((r as { unit_cost: number }).unit_cost),
    shipping: Number((r as { shipping: number }).shipping),
    return_rate: Number((r as { return_rate: number }).return_rate),
    ad_spend: Number((r as { ad_spend: number }).ad_spend),
    marketplace: (r as { marketplace: string }).marketplace,
  }));

  const seller = buildUserSeller(userRawRows, userId);
  if (!seller || seller.transactions.length === 0) {
    return NextResponse.json({ recorded: false, reason: "no_data" });
  }

  const currency = (seller.transactions[0]?.currency ?? "TRY") as Currency;
  const inputs = deriveUnderwritingInputsFromTransactions(seller.transactions, seller.tenureMonths);
  const decision = trueMarginModel(userId, inputs, currency);

  // Atomic read-compare-insert (see supabase/migrations/0006_decision_ledger_atomic_record.sql)
  // — two concurrent calls for the same user (e.g. a double-invoked mount
  // effect) used to both read the same "last row" via separate queries here
  // and both insert, producing duplicate ledger rows. The RPC serializes that
  // with a per-user advisory lock instead.
  const { data: inserted, error: rpcError } = await supabase.rpc("record_decision_if_changed", {
    p_tenant_id: userId,
    p_approved_limit: decision.approvedLimit,
    p_take_rate: decision.takeRate,
    p_currency: decision.currency,
    p_model_version: decision.modelVersion,
  });
  if (rpcError) {
    // Migration 0006 (record_decision_if_changed) may not be applied yet — this
    // call is fire-and-forget from the dashboard and must never surface as a
    // blocking 502 in the browser console after a successful Shopify connect.
    console.warn("[ledger/record] rpc unavailable:", rpcError.message);
    return NextResponse.json({ recorded: false, reason: "rpc_unavailable" });
  }

  return NextResponse.json({ recorded: !!inserted });
}
