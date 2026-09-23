import { NextResponse } from "next/server";
import { runVisibilityScan } from "@/lib/visibility/run-scan";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/cron/scan-visibility
 *
 * Scheduled visibility scan — scans a user's SKUs for marketplace search rank.
 * The scan logic itself lives in lib/visibility/run-scan.ts and is shared with
 * the user-triggered route (app/api/visibility/scan). This route only adds the
 * CRON_SECRET gate and body parsing.
 *
 * ── Security ─ Locked behind CRON_SECRET (same pattern as sync-marketplaces).
 * ── Rate limit ─ At most SCAN_BATCH_SIZE (default 5, max 10) SKUs per call,
 *    with a 3s delay between scans (see run-scan.ts).
 * ── Graceful degradation ─ Browser unavailable → { scanned: 0, errors: [...] }.
 * ── vercel.json cron ─ Not scheduled by default (first run needs approval).
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId: string;
  let marketplace: string;
  try {
    const body = (await req.json()) as { userId?: string; marketplace?: string };
    if (!body.userId || !body.marketplace) {
      return NextResponse.json(
        { error: "Request body must include { userId: string, marketplace: string }" },
        { status: 400 },
      );
    }
    userId = body.userId;
    marketplace = body.marketplace;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role yapılandırılmamış." }, { status: 500 });
  }

  const result = await runVisibilityScan(supabase, { userId, marketplace });
  if (result.unsupported) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
