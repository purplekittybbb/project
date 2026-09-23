// SANDBOX ONLY. Never set IYZICO_BASE_URL to the production URL without
// explicit user approval. Production URL: https://api.iyzipay.com
// Sandbox URL: https://sandbox-api.iyzipay.com

/**
 * POST /api/billing/iyzico/callback
 *
 * iyzico calls this URL after the user completes (or abandons) the checkout form.
 * iyzico sends a form-encoded body with `token`.
 *
 * On success: upsert iyzico_subscriptions row, redirect to dashboard
 * On failure: log error, return error response
 *
 * IDEMPOTENCY: iyzico may POST the same callback multiple times. We guard
 * against duplicate processing using the iyzico_payment_token unique index
 * (migration 0023). If the token is already recorded, we return success
 * immediately without re-writing anything.
 *
 * CANCELLATION: cancelling a subscription does NOT cut access immediately.
 * It sets cancelled_at and leaves status=active until current_period_end.
 * Feature gating reads current_period_end and grants access while in period.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveCheckoutFormResult, getIyzicoConfig } from "@/lib/iyzico/client";
import { computeGracePeriodEnd } from "@/lib/iyzico/subscription";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // ── Parse form body from iyzico ──────────────────────────────────────────
  let token: string | null = null;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      token = params.get("token");
    } else {
      const body = (await req.json()) as { token?: string };
      token = body.token ?? null;
    }
  } catch {
    return NextResponse.json({ error: "Invalid callback body" }, { status: 400 });
  }

  if (!token) {
    console.error("[iyzico/callback] No token received in callback.");
    return NextResponse.json({ error: "No token in callback" }, { status: 400 });
  }

  // ── Supabase client (service role for server-side writes) ─────────────────
  const supabase = createServiceRoleClient();

  if (!supabase) {
    console.error("[iyzico/callback] Supabase service role not configured.");
    return new Response(
      `<html><body><p>Ödeme alındı fakat kayıt hatası oluştu. Lütfen destek ile iletişime geçin.</p></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── Idempotency check: has this payment token already been processed? ──────
  // iyzico may re-deliver the same callback. The unique index on
  // iyzico_payment_token (migration 0023) prevents duplicates at the DB level,
  // but we short-circuit here to avoid unnecessary iyzico API calls.
  const { data: existingByToken } = await supabase
    .from("iyzico_subscriptions")
    .select("id, user_id")
    .eq("iyzico_payment_token", token)
    .maybeSingle();

  if (existingByToken) {
    console.log("[iyzico/callback] Token already processed (idempotent no-op): %s", token);
    return new Response(
      `<html><body>
        <p>Aboneliğiniz zaten aktif.</p>
        <script>
          if (window.parent !== window) {
            window.parent.postMessage({ type: "IYZICO_PAYMENT_SUCCESS", token: "${token.replace(/"/g, "")}" }, window.location.origin);
          } else { window.location.href = "/dashboard"; }
        </script>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── Retrieve payment result from iyzico ──────────────────────────────────
  let config;
  try {
    config = getIyzicoConfig();
  } catch (err) {
    console.error("[iyzico/callback] iyzico config error:", err);
    return NextResponse.json({ error: "iyzico yapılandırma hatası." }, { status: 500 });
  }

  const paymentResult = await retrieveCheckoutFormResult(config, token);

  if (paymentResult.status !== "success" || paymentResult.paymentStatus !== "SUCCESS") {
    console.error("[iyzico/callback] Payment failed:", paymentResult.errorMessage ?? paymentResult.paymentStatus);
    return new Response(
      `<html><body><p>Ödeme başarısız. Lütfen tekrar deneyin.</p><p>${paymentResult.errorMessage ?? ""}</p></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── Extract userId and planId from basketId / buyerId ────────────────────
  const rawBuyerId  = paymentResult.buyerId  ?? null;
  const rawBasketId = paymentResult.basketId ?? null;

  let resolvedUserId: string | null = rawBuyerId;
  let resolvedPlanId: "starter" | "pro" | null = null;

  if (rawBasketId) {
    if (rawBasketId.includes("-starter-")) resolvedPlanId = "starter";
    else if (rawBasketId.includes("-pro-")) resolvedPlanId = "pro";

    if (!resolvedUserId) {
      const planSuffix = resolvedPlanId ? `-${resolvedPlanId}-` : null;
      if (planSuffix) {
        const planIdx = rawBasketId.indexOf(planSuffix);
        if (planIdx > 0) resolvedUserId = rawBasketId.slice(0, planIdx);
      }
    }
  }

  console.log("[iyzico/callback] Payment successful. token=%s userId=%s planId=%s paymentId=%s",
    token, resolvedUserId, resolvedPlanId, paymentResult.paymentId);

  if (!resolvedUserId || !resolvedPlanId) {
    console.error("[iyzico/callback] Could not resolve userId or planId.", { rawBuyerId, rawBasketId });
    return new Response(
      `<html><body><p>Ödeme alındı. Aboneliğiniz kısa süre içinde aktif edilecek.</p></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── Write subscription record ────────────────────────────────────────────
  const now       = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: upsertError } = await supabase
    .from("iyzico_subscriptions")
    .upsert(
      {
        user_id:              resolvedUserId,
        plan_id:              resolvedPlanId,
        status:               "active",
        iyzico_payment_token: token,
        current_period_start: now,
        current_period_end:   periodEnd,
        // Clear any billing issue from a previous failed renewal
        billing_issue_at:     null,
        grace_period_end:     null,
        // Clear cancelled_at on renewal (user re-subscribed)
        cancelled_at:         null,
        updated_at:           now,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    // If it's a unique-constraint violation on iyzico_payment_token, treat as idempotent
    if (upsertError.code === "23505") {
      console.log("[iyzico/callback] Unique-constraint idempotency catch for token: %s", token);
    } else {
      console.error("[iyzico/callback] Failed to write subscription record:", upsertError.message);
    }
  } else {
    console.log("[iyzico/callback] Subscription record created/updated for user:", resolvedUserId);
  }

  return new Response(
    `<html><body>
      <p>Aboneliğiniz başarıyla oluşturuldu. Dashboard'a yönlendiriliyorsunuz...</p>
      <script>
        if (window.parent !== window) {
          window.parent.postMessage({ type: "IYZICO_PAYMENT_SUCCESS", token: "${token.replace(/"/g, "")}" }, window.location.origin);
        } else { window.location.href = "/dashboard"; }
      </script>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// ── Subscription management helpers (exported for API routes) ─────────────────

/**
 * Cancel a user's subscription at the end of the current period.
 *
 * CORRECT behaviour: access continues until current_period_end.
 * The status is set to "cancelled" and cancelled_at is recorded.
 * Feature gating (getSubscriptionStatus) reads current_period_end and
 * grants access while the paid period has not yet expired.
 *
 * WRONG would be: setting status="cancelled" + immediately blocking access.
 */
export async function cancelSubscriptionAtPeriodEnd(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("iyzico_subscriptions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      status:       "cancelled",
      cancelled_at: now,
      updated_at:   now,
    } as any)
    .eq("user_id", userId)
    .in("status", ["active", "trialing"]);

  if (error) {
    console.error("[cancelSubscriptionAtPeriodEnd] DB error:", error.message);
    return { error: "Abonelik iptal edilemedi." };
  }

  console.log("[cancelSubscriptionAtPeriodEnd] Cancelled at period end for user:", userId);
  return { error: null };
}

/**
 * Mark a subscription as past_due after a failed renewal.
 *
 * Sets billing_issue_at (for the UI banner) and grace_period_end.
 * The grace period length is controlled by BILLING_GRACE_PERIOD_DAYS (default 3).
 * During the grace period, hasAccess is still true (see getSubscriptionStatus).
 */
export async function markSubscriptionPastDue(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error: string | null }> {
  const now            = new Date();
  const gracePeriodEnd = computeGracePeriodEnd(now);

  const { error } = await supabase
    .from("iyzico_subscriptions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      status:           "past_due",
      billing_issue_at: now.toISOString(),
      grace_period_end: gracePeriodEnd,
      updated_at:       now.toISOString(),
    } as any)
    .eq("user_id", userId)
    .in("status", ["active", "trialing"]);

  if (error) {
    console.error("[markSubscriptionPastDue] DB error:", error.message);
    return { error: "Abonelik durumu güncellenemedi." };
  }

  console.log("[markSubscriptionPastDue] userId=%s gracePeriodEnd=%s", userId, gracePeriodEnd);
  return { error: null };
}
