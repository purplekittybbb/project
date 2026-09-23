/**
 * iyzico subscription status — feature gating layer.
 *
 * Reads from `iyzico_subscriptions` (migration 0021) to determine if a user
 * has an active paid subscription. Used by middleware to gate access to
 * premium features (visibility scanning, demand estimation, etc.).
 *
 * GRACEFUL DEGRADATION: if Supabase is not configured or the table doesn't
 * exist yet, returns a safe "no subscription" result — never throws.
 *
 * SANDBOX NOTE: this module is subscription-plan-agnostic. It only checks
 * the `status` column. The payment flow that creates rows here is in
 * lib/iyzico/client.ts (sandbox only until explicit production approval).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase/client";

const TABLE = "iyzico_subscriptions";
const TRIAL_TABLE = "billing_subscriptions";

export type PlanId = "starter" | "pro";
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";

export interface SubscriptionInfo {
  /** Whether the user has any usable subscription (active or trialing). */
  hasAccess: boolean;
  /** Null when no subscription row exists. */
  status: SubscriptionStatus | null;
  /** Null when no subscription row exists. */
  planId: PlanId | null;
  /** ISO timestamp of current period end, null if none. */
  currentPeriodEnd: string | null;
  /** True when there's no row at all in iyzico_subscriptions. */
  isNew: boolean;
  /**
   * True when access was GRANTED because of a DB/network error (fail-open
   * safety valve). This means we could not determine the real status and
   * chose to let the user through rather than lock out a paying customer
   * during a transient infrastructure outage.
   *
   * Callers should log a WARNING whenever this is true. If it triggers
   * frequently it signals a real infrastructure problem (misconfigured env
   * vars, Supabase downtime, missing 0021 migration).
   */
  failOpen: boolean;
  /**
   * True when the subscription is past_due but within the grace period.
   * The user still has access; show a "ödemeniz alınamadı" banner in the UI.
   * Grace period length: BILLING_GRACE_PERIOD_DAYS env var (default 3).
   */
  inGracePeriod: boolean;
  /**
   * ISO timestamp when a billing problem was first detected.
   * Non-null when the user has a payment failure they should resolve.
   * Used by the dashboard to show the billing issue banner.
   */
  billingIssueAt: string | null;
  /**
   * ISO timestamp of grace period end.
   * Non-null only when inGracePeriod is true.
   */
  gracePeriodEnd: string | null;
}

/** Statuses that grant access to premium features. */
const ACCESS_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

// ── Client-side (browser session) ─────────────────────────────────────────────

/**
 * Get the signed-in user's subscription status.
 * Uses the browser Supabase client (RLS scopes to auth.uid()).
 */
export async function getMySubscriptionStatus(): Promise<SubscriptionInfo> {
  const supabase = getSupabaseClient();
  if (!supabase) return noSubscription();  // Supabase not configured — no session possible

  const { data, error } = await supabase
    .from(TABLE)
    .select("plan_id, status, current_period_end, grace_period_end, billing_issue_at, cancelled_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[getMySubscriptionStatus] DB error — failing closed: %s", error.message);
    return failClosedAccess();
  }
  if (!data) {
    const { data: authData } = await supabase.auth.getUser();
    return trialFallback(supabase, authData.user?.id ?? null);
  }
  return mapRow(data as SubscriptionRow);
}

// ── Server-side (API routes / middleware) ─────────────────────────────────────

/**
 * Get subscription status for a specific user.
 * Accepts an explicit SupabaseClient (service-role or user-scoped).
 * Called from middleware and API routes that have the client in scope.
 */
export async function getSubscriptionStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionInfo> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("plan_id, status, current_period_end, grace_period_end, billing_issue_at, cancelled_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Technical failure — could not reach DB or table doesn't exist yet.
      // Fail CLOSED so a broken read cannot unlock paid APIs for free users.
      console.warn(
        "[getSubscriptionStatus] DB error — failing closed (userId=%s): %s",
        userId,
        error.message,
      );
      return failClosedAccess();
    }

    if (!data) {
      // No iyzico (real paid) row — but this project also has a SEPARATE
      // Stripe/demo free-trial table (billing_subscriptions, see
      // app/api/billing/start-trial and start-demo-trial). Before this fix,
      // a user actively in that free trial (status "trialing", real Stripe
      // subscription or demo card-less trial) was blocked from every premium
      // route (/api/demand, /api/top100, /api/cron/scan-visibility) because
      // this function only ever looked at iyzico_subscriptions — a genuine
      // architectural gap between the two billing paths (see audit report).
      // Checking the trial table here as a fallback closes that gap without
      // touching either table's schema or the iyzico-is-the-real-paid-plan
      // semantics: iyzico still wins whenever a row exists there.
      return trialFallback(supabase, userId);
    }

    return mapRow(data as SubscriptionRow);
  } catch (err) {
    console.warn(
      "[getSubscriptionStatus] Unexpected exception — failing closed (userId=%s): %s",
      userId,
      err instanceof Error ? err.message : String(err),
    );
    return failClosedAccess();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SubscriptionRow {
  plan_id: string;
  status: string;
  current_period_end: string | null;
  grace_period_end?: string | null;     // added in 0023
  billing_issue_at?: string | null;     // added in 0023
  cancelled_at?: string | null;
}

/**
 * Grace period length in days.
 * Read from BILLING_GRACE_PERIOD_DAYS env var; defaults to 3.
 * The env var keeps this tunable without a code deploy.
 */
function gracePeriodDays(): number {
  const v = parseInt(process.env.BILLING_GRACE_PERIOD_DAYS ?? "3", 10);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

function mapRow(r: SubscriptionRow): SubscriptionInfo {
  const status = r.status as SubscriptionStatus;
  const now = Date.now();

  // Grace period: past_due within the grace window still gets access
  const gracePeriodEnd = r.grace_period_end ?? null;
  const inGracePeriod =
    status === "past_due" &&
    gracePeriodEnd !== null &&
    new Date(gracePeriodEnd).getTime() > now;

  // Cancellation at period end: a cancelled subscription keeps access until
  // current_period_end. This implements "cancel at period end" correctly —
  // the subscriber paid for the remainder of the period.
  const currentPeriodEnd = r.current_period_end ?? null;
  const cancelledButInPeriod =
    status === "cancelled" &&
    currentPeriodEnd !== null &&
    new Date(currentPeriodEnd).getTime() > now;

  const hasAccess =
    ACCESS_STATUSES.includes(status) ||
    inGracePeriod ||
    cancelledButInPeriod;

  return {
    hasAccess,
    status,
    planId: r.plan_id as PlanId,
    currentPeriodEnd,
    isNew: false,
    failOpen: false,
    inGracePeriod,
    billingIssueAt: r.billing_issue_at ?? null,
    gracePeriodEnd,
  };
}

/**
 * Fallback for when the user has no iyzico_subscriptions row: check the
 * separate Stripe/demo free-trial table (billing_subscriptions) so a user
 * actively inside their free trial isn't blocked from premium routes.
 * See the long comment at this function's call site for why this exists.
 * Best-effort — any error here degrades to noSubscription(), never throws.
 */
async function trialFallback(supabase: SupabaseClient, userId: string | null): Promise<SubscriptionInfo> {
  try {
    if (!userId) return noSubscription();

    const { data: trialRow } = await supabase
      .from(TRIAL_TABLE)
      .select("status, trial_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (!trialRow) return noSubscription();

    const status = trialRow.status as string;
    const trialEnd = trialRow.trial_end as string | null;
    const trialStillOpen = trialEnd === null || new Date(trialEnd).getTime() > Date.now();
    const hasAccess = (status === "trialing" || status === "active") && trialStillOpen;

    return {
      hasAccess,
      status: hasAccess ? "trialing" : null,
      planId: null,
      currentPeriodEnd: trialEnd,
      isNew: false,
      failOpen: false,
      inGracePeriod: false,
      billingIssueAt: null,
      gracePeriodEnd: null,
    };
  } catch (err) {
    console.warn("[trialFallback] unexpected error — falling back to noSubscription: %s",
      err instanceof Error ? err.message : String(err));
    return noSubscription();
  }
}

/** User has no subscription row — this is a real "not subscribed" state, not a tech error. */
function noSubscription(): SubscriptionInfo {
  return {
    hasAccess: false, status: null, planId: null, currentPeriodEnd: null,
    isNew: true, failOpen: false, inGracePeriod: false,
    billingIssueAt: null, gracePeriodEnd: null,
  };
}

function failClosedAccess(): SubscriptionInfo {
  return {
    hasAccess: false, status: null, planId: null, currentPeriodEnd: null,
    isNew: false, failOpen: false, inGracePeriod: false,
    billingIssueAt: null, gracePeriodEnd: null,
  };
}

// ── Exported helpers ──────────────────────────────────────────────────────────

/**
 * Compute the grace period end date from a billing failure timestamp.
 * Returns an ISO timestamp string.
 */
export function computeGracePeriodEnd(failureTime: Date = new Date()): string {
  const end = new Date(failureTime.getTime() + gracePeriodDays() * 24 * 60 * 60 * 1000);
  return end.toISOString();
}

/** Expose grace period days for use by other modules (e.g. cron renewal handler). */
export { gracePeriodDays };
