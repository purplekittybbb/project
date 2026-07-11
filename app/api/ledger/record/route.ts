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

interface LedgerRow {
  approved_limit: number;
  take_rate: number;
  currency: string;
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

  const { data: lastRow, error: lastRowError } = await supabase
    .from("decision_ledger")
    .select("approved_limit, take_rate, currency")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRowError) {
    return NextResponse.json({ error: "Geçmiş kararlar okunamadı." }, { status: 502 });
  }

  const last = lastRow as LedgerRow | null;
  const unchanged =
    !!last &&
    last.approved_limit === decision.approvedLimit &&
    Math.abs(last.take_rate - decision.takeRate) < 1e-9 &&
    last.currency === decision.currency;
  if (unchanged) {
    return NextResponse.json({ recorded: false, reason: "unchanged" });
  }

  const { error: insertError } = await supabase.from("decision_ledger").insert({
    user_id: userId,
    tenant_id: userId,
    approved_limit: decision.approvedLimit,
    take_rate: decision.takeRate,
    currency: decision.currency,
    model_version: decision.modelVersion,
  });
  if (insertError) {
    return NextResponse.json({ error: "Karar kaydedilemedi." }, { status: 502 });
  }

  return NextResponse.json({ recorded: true });
}
