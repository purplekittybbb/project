import { NextResponse } from "next/server";
import { bearerToken, userScopedClient } from "@/lib/billing/auth";
import {
  getStripe,
  growthSubscriptionItem,
  trialPeriodDays,
} from "@/lib/billing/stripe-server";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";

/**
 * POST /api/billing/start-trial
 *
 * After the client confirms a SetupIntent (card saved), creates a Stripe
 * Subscription with a free trial and persists status to billing_subscriptions.
 */
export const runtime = "nodejs";

interface StartTrialBody {
  setupIntentId?: string;
}

export async function POST(req: Request) {
  if (!isStripeLiveEnabled()) {
    return NextResponse.json({ error: "Stripe yapılandırılmamış." }, { status: 503 });
  }

  const accessToken = bearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  let body: StartTrialBody;
  try {
    body = (await req.json()) as StartTrialBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const setupIntentId = body.setupIntentId?.trim();
  if (!setupIntentId) {
    return NextResponse.json({ error: "setupIntentId gerekli." }, { status: 400 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe yapılandırılmamış." }, { status: 503 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Oturum geçersiz." }, { status: 401 });
  }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  if (setupIntent.status !== "succeeded") {
    return NextResponse.json({ error: "Kart doğrulanmadı — lütfen tekrar deneyin." }, { status: 400 });
  }
  if (setupIntent.metadata?.supabase_user_id !== user.id) {
    return NextResponse.json({ error: "Yetkisiz SetupIntent." }, { status: 403 });
  }

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;
  if (!paymentMethodId) {
    return NextResponse.json({ error: "Ödeme yöntemi bulunamadı." }, { status: 400 });
  }

  const customerId =
    typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;
  if (!customerId) {
    return NextResponse.json({ error: "Stripe müşteri kaydı bulunamadı." }, { status: 400 });
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const { data: billingRow } = await supabase
    .from("billing_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (billingRow?.stripe_subscription_id && billingRow.status === "trialing") {
    return NextResponse.json({
      success: true,
      status: "trialing",
      subscriptionId: billingRow.stripe_subscription_id,
      alreadyActive: true,
    });
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [growthSubscriptionItem()],
    trial_period_days: trialPeriodDays(),
    default_payment_method: paymentMethodId,
    metadata: { supabase_user_id: user.id },
  });

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  const { error: upsertError } = await supabase.from("billing_subscriptions").upsert(
    {
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      trial_end: trialEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("[billing/start-trial] billing_subscriptions upsert failed:", upsertError.message);
    return NextResponse.json({ error: "Abonelik kaydı güncellenemedi." }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    status: subscription.status,
    subscriptionId: subscription.id,
    trialEnd,
  });
}
