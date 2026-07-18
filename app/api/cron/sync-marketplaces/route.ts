import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isResyncableMarketplace, resyncMarketplace } from "@/lib/marketplace-resync";

/**
 * GET /api/cron/sync-marketplaces
 *
 * Vercel Cron entry point — see vercel.json ("0 * * * *", every hour UTC).
 * This is the automatic background sync: a user who connected Trendyol/
 * Hepsiburada/N11/Shopify once never has to click anything for new orders
 * to show up — this route re-syncs EVERY stored connection on a schedule,
 * using resyncMarketplace() (lib/marketplace-resync.ts), the same
 * idempotent, de-duplicated function the dashboard's manual "Refresh"
 * button uses. Shopify also pushes near-real-time updates via
 * /api/shopify/webhooks; this cron remains the backstop for all platforms.
 *
 * ── Security ─────────────────────────────────────────────────────────────
 * Locked behind CRON_SECRET (Vercel's documented cron-auth pattern: Vercel
 * automatically sends `Authorization: Bearer <CRON_SECRET>` when IT invokes
 * this route — https://vercel.com/docs/cron-jobs/manage-cron-jobs). Request
 * is rejected before anything else runs if that header doesn't match.
 *
 * This check exists specifically BECAUSE this route creates a Supabase
 * SERVICE ROLE client below (the only place in this codebase that does) —
 * service role bypasses Row-Level Security entirely, which is required here
 * (a cron isn't "a user", it must see every user's stored credentials), but
 * would be a severe data-isolation breach if this route were ever reachable
 * without the secret. The service-role client is created ONLY inside this
 * file, is never exported, and its key is never logged — not even on a
 * config or auth failure.
 *
 * ── Rate limits ──────────────────────────────────────────────────────────
 * Every connected account across every user is synced ONE AT A TIME (a
 * plain sequential loop, never Promise.all), with a small delay between
 * each — this endpoint fans out across potentially many users, and vendor
 * rate limits (Trendyol/N11: 1000 req/min, Hepsiburada: similar) apply
 * per-account but a burst of many accounts hitting the same vendor
 * simultaneously is still worth avoiding. A slow/stuck call for one user
 * also can't block or crowd out the others under this model — it just
 * means that user's sync takes its turn.
 */

export const runtime = "nodejs";
// Sequential processing across many connected accounts can take a while —
// give this function room to finish instead of racing Vercel's default limit.
export const maxDuration = 300;

// Configurable so tests can run this instantly; production keeps a real stagger.
const SYNC_DELAY_MS = Number(process.env.CRON_SYNC_DELAY_MS) || 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Service-role Supabase client — bypasses RLS on purpose (see module doc).
 * Created fresh per request, kept strictly local to this function; never
 * put the key itself into a log line or an error response.
 */
function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface SyncOutcome {
  userId: string;
  marketplace: string;
  success: boolean;
  ordersFetched?: number;
  rowsSaved?: number;
  duplicatesSkipped?: number;
  error?: string;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  // Compare both values without ever echoing either one back — a mismatch
  // is reported generically, exactly like a missing header.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[cron/sync-marketplaces] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not configured.");
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  const { data: credRows, error: credError } = await supabase
    .from("marketplace_credentials")
    .select("user_id, marketplace");
  if (credError) {
    console.error("[cron/sync-marketplaces] failed to list marketplace_credentials:", credError.message);
    return NextResponse.json({ error: "Kayıtlı bağlantılar okunamadı." }, { status: 500 });
  }

  const targets = ((credRows ?? []) as { user_id: string; marketplace: string }[])
    .filter((row) => isResyncableMarketplace(row.marketplace));

  console.log(`[cron/sync-marketplaces] starting sequential sync for ${targets.length} connection(s).`);

  const results: SyncOutcome[] = [];
  for (let i = 0; i < targets.length; i++) {
    const { user_id: userId, marketplace } = targets[i];
    try {
      const result = await resyncMarketplace(supabase, userId, marketplace);
      results.push(
        result.success
          ? { userId, marketplace, success: true, ordersFetched: result.ordersFetched, rowsSaved: result.rowsSaved, duplicatesSkipped: result.duplicatesSkipped }
          : { userId, marketplace, success: false, error: result.error }
      );
    } catch (err) {
      // A single account's unexpected failure must never abort the run for
      // everyone else queued behind it.
      console.error(`[cron/sync-marketplaces] unexpected error syncing ${marketplace} for user ${userId}:`, err);
      results.push({ userId, marketplace, success: false, error: "Beklenmeyen hata." });
    }
    // Stagger requests to the SAME vendor across DIFFERENT accounts — a
    // sequential loop already prevents concurrency, this adds a floor on
    // request spacing so a large user base can't still burst a vendor.
    if (i < targets.length - 1) await delay(SYNC_DELAY_MS);
  }

  const succeeded = results.filter((r) => r.success).length;
  const totalNewRows = results.reduce((sum, r) => sum + (r.rowsSaved ?? 0), 0);
  const totalDuplicatesSkipped = results.reduce((sum, r) => sum + (r.duplicatesSkipped ?? 0), 0);

  console.log(
    `[cron/sync-marketplaces] done: ${succeeded}/${results.length} connection(s) synced, ` +
      `${totalNewRows} new row(s), ${totalDuplicatesSkipped} duplicate(s) correctly skipped.`
  );

  return NextResponse.json({
    checked: results.length,
    succeeded,
    totalNewRows,
    totalDuplicatesSkipped,
    results,
  });
}
