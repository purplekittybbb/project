import { NextResponse } from "next/server";
import { bearerToken, userScopedClient } from "@/lib/billing/auth";
import { isDemoBillingCustomer } from "@/lib/billing/demo-trial";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";
import { launchPlanDisplay } from "@/lib/product-market";

/**
 * GET /api/billing/status
 *
 * Returns the signed-in user's subscription row (if any) plus whether Stripe
 * is configured server-side — for Settings → Billing and /connect step 3.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const accessToken = bearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz." }, { status: 401 });
  }

  const { data: row, error: rowError } = await supabase
    .from("billing_subscriptions")
    .select("status, trial_end, stripe_subscription_id, stripe_customer_id, updated_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (rowError) {
    console.error("[billing/status] read failed:", rowError.message);
    return NextResponse.json({ error: "Abonelik bilgisi okunamadı." }, { status: 502 });
  }

  const plan = launchPlanDisplay();

  return NextResponse.json({
    stripeConfigured: isStripeLiveEnabled(),
    plan: {
      currency: plan.currency,
      amount: plan.amount,
      formattedAfterTrial: plan.formattedAfterTrial,
    },
    subscription: row
      ? {
          status: row.status as string,
          trialEnd: row.trial_end as string | null,
          hasActiveSubscription: !!row.stripe_subscription_id,
          isDemo: isDemoBillingCustomer(row.stripe_customer_id as string),
          updatedAt: row.updated_at as string,
        }
      : null,
  });
}
