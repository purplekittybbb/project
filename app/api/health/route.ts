import { NextResponse } from "next/server";
import { getConfigStatus } from "@/lib/config-status";

/**
 * GET /api/health — readiness + configuration check.
 *
 * The single, safe answer to "did this deployment get configured correctly?".
 * Returns a boolean per subsystem (never a secret VALUE) so it can be read by
 * anyone — a monitor, a deploy script, or a human debugging why a real
 * marketplace connect fails — without leaking anything sensitive.
 *
 * HTTP status: 200 when the app's critical subsystem (Supabase) is present,
 * 503 when it isn't (so an uptime monitor / load balancer can gate on it).
 * Optional subsystems being absent (Stripe, Shopify, AI, cron) never make the
 * app "unhealthy" — each has a documented, honest fallback — but they're all
 * reported explicitly so a missing one is never a silent surprise in prod.
 */
export const runtime = "nodejs";

export function GET() {
  const status = getConfigStatus();
  return NextResponse.json(
    {
      ok: status.ready,
      ready: status.ready,
      subsystems: status.subsystems,
      missingCritical: status.missingCritical,
      timestamp: new Date().toISOString(),
    },
    { status: status.ready ? 200 : 503 }
  );
}
