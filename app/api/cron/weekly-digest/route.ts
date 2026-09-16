import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildUserSeller, toStored, type DbRow } from "@/lib/supabase/user-data";
import { buildSellerView } from "@/lib/engine";
import { buildDigestHtml, buildDigestSubject } from "@/lib/email/weekly-digest";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { siteOrigin } from "@/lib/seo";

/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron entry point — see vercel.json (weekly, Monday morning). Sends
 * every opted-in user (`user_settings.weekly_digest_enabled = true`, see
 * migration 0035) a real, computed-from-their-own-data profit summary email.
 *
 * ── Security ─────────────────────────────────────────────────────────────
 * Same CRON_SECRET pattern as every other cron route in this project (see
 * sync-marketplaces/route.ts) — required before a service-role client (the
 * only way to read every opted-in user's transactions and email address) is
 * ever created.
 *
 * ── Email delivery ───────────────────────────────────────────────────────
 * Uses lib/email/resend.ts (raw fetch, no SDK dependency added). Requires
 * RESEND_API_KEY + RESEND_FROM_EMAIL to actually be set in the environment —
 * if they are not, this route still runs (so it's safe to enable the cron
 * schedule before email is configured) but reports every send as skipped
 * rather than throwing.
 *
 * ── Rate limits ──────────────────────────────────────────────────────────
 * Sequential, one user at a time (never Promise.all) — mirrors
 * sync-marketplaces's reasoning: this fans out across every opted-in user,
 * and a slow/stuck send for one user must never block the others.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface DigestOutcome {
  userId: string;
  sent: boolean;
  reason?: string;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[cron/weekly-digest] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not configured.");
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  if (!isEmailConfigured()) {
    console.warn("[cron/weekly-digest] RESEND_API_KEY/RESEND_FROM_EMAIL not configured — running in dry-run mode.");
  }

  const { data: settingsRows, error: settingsError } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("weekly_digest_enabled", true);
  if (settingsError) {
    // Most likely cause: migration 0035 hasn't been applied yet.
    console.error("[cron/weekly-digest] failed to list opted-in users:", settingsError.message);
    return NextResponse.json({ error: "user_settings okunamadı (migration uygulandı mı?)." }, { status: 500 });
  }

  const userIds = ((settingsRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  console.log(`[cron/weekly-digest] ${userIds.length} kullanıcı haftalık özete kayıtlı.`);

  const origin = siteOrigin();
  const results: DigestOutcome[] = [];

  for (const userId of userIds) {
    try {
      const { data: txRows, error: txError } = await supabase
        .from("user_transactions")
        .select("*")
        .eq("user_id", userId);
      if (txError || !txRows || txRows.length === 0) {
        results.push({ userId, sent: false, reason: "veri yok" });
        continue;
      }

      const rows = (txRows as DbRow[]).map(toStored);
      const seller = buildUserSeller(rows, userId);
      if (!seller) {
        results.push({ userId, sent: false, reason: "seller oluşturulamadı" });
        continue;
      }
      const view = buildSellerView(seller, "combined");
      if (!view) {
        results.push({ userId, sent: false, reason: "view oluşturulamadı" });
        continue;
      }

      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (authError || !email) {
        results.push({ userId, sent: false, reason: "e-posta bulunamadı" });
        continue;
      }

      if (!isEmailConfigured()) {
        results.push({ userId, sent: false, reason: "e-posta yapılandırılmadı (dry-run)" });
        continue;
      }

      const digestInput = { sellerLabel: email, view, dashboardUrl: `${origin}/dashboard` };
      const sendResult = await sendEmail(email, buildDigestSubject(digestInput), buildDigestHtml(digestInput));
      results.push({ userId, sent: sendResult.ok, reason: sendResult.error });
    } catch (err) {
      console.error(`[cron/weekly-digest] user ${userId} failed:`, err);
      results.push({ userId, sent: false, reason: err instanceof Error ? err.message : "bilinmeyen hata" });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  console.log(`[cron/weekly-digest] tamamlandı: ${sentCount}/${results.length} gönderildi.`);
  return NextResponse.json({ total: results.length, sent: sentCount, results });
}
