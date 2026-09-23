import { NextResponse } from "next/server";
import { bearerToken, requireBillingActor } from "@/lib/billing/auth";
import { cancelSubscriptionAtPeriodEnd } from "../callback/route";

/**
 * POST /api/billing/iyzico/cancel
 *
 * Cancels the signed-in user's active/trialing iyzico subscription AT PERIOD END.
 * Uses service-role for the write (0038 removed user UPDATE on iyzico_subscriptions).
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireBillingActor(bearerToken(req));
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { error } = await cancelSubscriptionAtPeriodEnd(actor.svc, actor.user.id);
  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
