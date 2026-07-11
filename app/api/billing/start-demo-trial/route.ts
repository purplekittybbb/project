import { NextResponse } from "next/server";
import { bearerToken, userScopedClient } from "@/lib/billing/auth";
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

  const accessToken = bearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Oturum geçersiz." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("billing_subscriptions")
    .select("status, trial_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "trialing") {
    return NextResponse.json({
      success: true,
      status: "trialing",
      trialEnd: existing.trial_end as string | null,
      isDemo: true,
      alreadyActive: true,
    });
  }

  const trialEnd = computeTrialEndIso();
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase.from("billing_subscriptions").upsert(
    {
      user_id: user.id,
      stripe_customer_id: demoCustomerId(user.id),
      stripe_subscription_id: null,
      status: "trialing",
      trial_end: trialEnd,
      updated_at: now,
    },
    { onConflict: "user_id" }
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
