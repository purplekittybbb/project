import { NextResponse } from "next/server";
import { bearerToken, requireBillingActor } from "@/lib/billing/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/account/delete
 * KVKK/GDPR — soft-delete user data then remove Auth user (service role).
 * Requires Authorization Bearer of the account being deleted.
 */
export const runtime = "nodejs";

const TABLES_BY_USER = [
  "user_transactions",
  "marketplace_credentials",
  "product_costs",
  "settlement_payouts",
  "loss_alarms",
  "demand_estimates",
  "profit_history",
  "visibility_watches",
  "visibility_checks",
  "billing_subscriptions",
  "iyzico_subscriptions",
  "extension_tokens",
  "user_settings",
  "guest_tool_usage",
  "decision_ledger",
  "tenant_members",
] as const;

export async function POST(req: Request) {
  const accessToken = bearerToken(req);
  const actor = await requireBillingActor(accessToken);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let confirm = "";
  try {
    const body = (await req.json()) as { confirm?: string };
    confirm = (body.confirm ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  if (confirm !== "SIL" && confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Onay için body.confirm = \"SIL\" gönderin." },
      { status: 400 },
    );
  }

  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });
  }

  const userId = actor.user.id;

  // Best-effort wipe of tenant tables (ignore missing tables).
  for (const table of TABLES_BY_USER) {
    try {
      if (table === "tenant_members") {
        await svc.from(table).delete().or(`owner_user_id.eq.${userId},member_user_id.eq.${userId}`);
      } else if (table === "guest_tool_usage") {
        await svc.from(table).delete().eq("subject_key", userId).eq("subject_type", "user");
      } else {
        await svc.from(table).delete().eq("user_id", userId);
      }
    } catch (err) {
      console.warn("[account/delete] wipe %s:", table, err);
    }
  }

  const { error: authErr } = await svc.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("[account/delete] auth.admin.deleteUser:", authErr.message);
    return NextResponse.json(
      { error: "Veriler temizlendi ancak auth hesabı silinemedi — destek ile iletişime geçin." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
