import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/billing/stripe/webhook
 *
 * Keeps billing_subscriptions in sync after checkout / renewals / cancel.
 * Without this, start-trial writes once and never updates when Stripe flips
 * trialing → active or cancels — users "pay" but the panel stays locked.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook yapılandırılmamış." }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature verify failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Service role missing." }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertFromSubscription(svc, stripe, sub);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && typeof session.subscription === "string") {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await upsertFromSubscription(svc, stripe, sub, session.metadata?.supabase_user_id);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function upsertFromSubscription(
  svc: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  stripe: Stripe,
  sub: Stripe.Subscription,
  userIdHint?: string | null,
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  let userId =
    userIdHint ||
    (typeof sub.metadata?.supabase_user_id === "string" ? sub.metadata.supabase_user_id : null);

  if (!userId) {
    const { data: byCustomer } = await svc
      .from("billing_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = byCustomer?.user_id ?? null;
  }

  if (!userId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted && typeof customer.metadata?.supabase_user_id === "string") {
        userId = customer.metadata.supabase_user_id;
      }
    } catch {
      /* ignore */
    }
  }

  if (!userId) {
    console.warn("[stripe/webhook] no user_id for subscription %s", sub.id);
    return;
  }

  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  const status = sub.status === "canceled" ? "canceled" : sub.status;

  const { error } = await svc.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status,
      trial_end: trialEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[stripe/webhook] upsert failed:", error.message);
    throw error;
  }
}
