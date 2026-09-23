import { NextResponse } from "next/server";
import { bearerToken, requireBillingActor } from "@/lib/billing/auth";
import { computeTrialEndIso, demoCustomerId } from "@/lib/billing/demo-trial";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";

/**
 * POST /api/billing/start-demo-trial
 *
 * When Stripe is not configured, /connect step 3 uses a demo card form.
 * This route persists an honest "trialing" row without a payment method so
 * Settings → Billing reflects the free trial the user just started.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (isStripeLiveEnabled()) {
    return NextResponse.json({ error: "Stripe aktif — demo deneme kullanılamaz." }, { status: 503 });
  }

  const actor = await requireBillingActor(bearerToken(req));
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const { user, svc } = actor;

  const { data: existing } = await svc
    .from("billing_subscriptions")
    .select("status, trial_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "trialing" || existing?.status === "active") {
    return NextResponse.json({
      success: true,
      status: existing.status,
      trialEnd: existing.trial_end as string | null,
      isDemo: true,
      alreadyActive: true,
    });
  }

  const trialEnd = computeTrialEndIso();
  const now = new Date().toISOString();

  const { error: upsertError } = await svc.from("billing_subscriptions").upsert(
    {
      user_id: user.id,
      stripe_customer_id: demoCustomerId(user.id),
      stripe_subscription_id: null,
      status: "trialing",
      trial_end: trialEnd,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    console.error("[billing/start-demo-trial] upsert failed:", upsertError.message);
    return NextResponse.json({ error: "Deneme kaydı oluşturulamadı." }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    status: "trialing",
    trialEnd,
    isDemo: true,
  });
}
