import { NextResponse } from "next/server";
import { bearerToken, requireBillingActor } from "@/lib/billing/auth";
import { getStripe } from "@/lib/billing/stripe-server";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";
import { isDemoBillingCustomer } from "@/lib/billing/demo-trial";

/**
 * POST /api/billing/setup-intent
 *
 * Creates (or reuses) a Stripe Customer for the signed-in user and returns a
 * SetupIntent client secret for the Payment Element on /connect step 3.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isStripeLiveEnabled()) {
    return NextResponse.json({ error: "Stripe yapılandırılmamış." }, { status: 503 });
  }

  const actor = await requireBillingActor(bearerToken(req));
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const { user, svc } = actor;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe yapılandırılmamış." }, { status: 503 });
  }

  const { data: existing } = await svc
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id as string | undefined;

  // Demo trial leaves stripe_customer_id = "demo:{uuid}" — never pass that to Stripe.
  if (customerId && isDemoBillingCustomer(customerId)) {
    customerId = undefined;
  }

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const { error: upsertError } = await svc.from("billing_subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (upsertError) {
        console.error("[billing/setup-intent] billing_subscriptions upsert failed:", upsertError.message);
        return NextResponse.json({ error: "Abonelik kaydı oluşturulamadı." }, { status: 502 });
      }
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { supabase_user_id: user.id },
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json({ error: "SetupIntent oluşturulamadı." }, { status: 502 });
    }

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("[billing/setup-intent] Stripe call failed:", err);
    return NextResponse.json({ error: "Ödeme sağlayıcısına bağlanılamadı — lütfen tekrar deneyin." }, { status: 502 });
  }
}
