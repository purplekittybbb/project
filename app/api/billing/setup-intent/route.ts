import { NextResponse } from "next/server";
import { bearerToken, userScopedClient } from "@/lib/billing/auth";
import { getStripe } from "@/lib/billing/stripe-server";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";

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

  const accessToken = bearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
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

  const { data: existing } = await supabase
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    const { error: insertError } = await supabase.from("billing_subscriptions").insert({
      user_id: user.id,
      stripe_customer_id: customerId,
      status: "pending",
    });
    if (insertError) {
      console.error("[billing/setup-intent] billing_subscriptions insert failed:", insertError.message);
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
}
