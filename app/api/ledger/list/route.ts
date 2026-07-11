import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/ledger/list
 *
 * The signed-in user's own decision_ledger rows (RLS-scoped), oldest first.
 * Backs the History tab for authenticated users — replacing the old
 * getBacktest().ledger seed-portfolio display (which the /demo walkthrough
 * still uses, unchanged, since it's the seed data it's supposed to show).
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

interface DbLedgerRow {
  id: string;
  approved_limit: number;
  take_rate: number;
  currency: string;
  model_version: string;
  recorded_at: string;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ entries: [] });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ entries: [] });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ entries: [] });
  }

  const { data, error } = await supabase
    .from("decision_ledger")
    .select("id, approved_limit, take_rate, currency, model_version, recorded_at")
    .eq("user_id", userData.user.id)
    .order("recorded_at", { ascending: true });
  if (error || !data) {
    return NextResponse.json({ entries: [] });
  }

  const entries = (data as DbLedgerRow[]).map((row, idx) => ({
    seq: idx + 1,
    recordedAt: row.recorded_at,
    approvedLimit: Number(row.approved_limit),
    takeRate: Number(row.take_rate),
    currency: row.currency,
    modelVersion: row.model_version,
  }));

  return NextResponse.json({ entries });
}
