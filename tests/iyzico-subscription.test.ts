/**
 * Tests for lib/iyzico/subscription.ts — getSubscriptionStatus().
 *
 * Uses mock Supabase clients — no real DB calls, no real iyzico credentials.
 *
 * Covers:
 *   - Access statuses (active, trialing)
 *   - Denial statuses (cancelled, past_due)
 *   - Fail-closed on DB error / exception
 *   - Fail-closed on missing row (no subscription)
 *   - Grace period: past_due within grace window → still has access
 *   - Cancellation at period end: cancelled but period not yet expired → has access
 *   - inGracePeriod and billingIssueAt fields
 */

import { describe, it, expect } from "vitest";
import { getSubscriptionStatus, computeGracePeriodEnd } from "../lib/iyzico/subscription";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock Supabase builder ──────────────────────────────────────────────────────

function makeMockSupabase(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
): SupabaseClient {
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    maybeSingle: async () => ({ data, error }),
  };
  return {
    from: () => chainable,
  } as unknown as SupabaseClient;
}

function makeThrowingSupabase(): SupabaseClient {
  return {
    from: () => { throw new Error("Connection refused"); },
  } as unknown as SupabaseClient;
}

// ── Core access status tests ───────────────────────────────────────────────────

describe("getSubscriptionStatus", () => {
  it("returns hasAccess=true for status='active'", async () => {
    const supabase = makeMockSupabase({
      plan_id: "starter",
      status: "active",
      current_period_end: "2026-12-31T00:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-123");
    expect(result.hasAccess).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.status).toBe("active");
    expect(result.planId).toBe("starter");
    expect(result.isNew).toBe(false);
    expect(result.currentPeriodEnd).toBe("2026-12-31T00:00:00Z");
    expect(result.inGracePeriod).toBe(false);
    expect(result.billingIssueAt).toBeNull();
  });

  it("returns hasAccess=true for status='trialing'", async () => {
    const supabase = makeMockSupabase({
      plan_id: "pro",
      status: "trialing",
      current_period_end: "2026-10-01T00:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-456");
    expect(result.hasAccess).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.status).toBe("trialing");
    expect(result.planId).toBe("pro");
    expect(result.inGracePeriod).toBe(false);
  });

  it("returns hasAccess=false for status='cancelled' (period already ended)", async () => {
    // current_period_end in the past → access denied
    const supabase = makeMockSupabase({
      plan_id: "starter",
      status: "cancelled",
      current_period_end: "2020-01-01T00:00:00Z", // well in the past
    });
    const result = await getSubscriptionStatus(supabase, "user-789");
    expect(result.hasAccess).toBe(false);
    expect(result.failOpen).toBe(false);
    expect(result.status).toBe("cancelled");
  });

  it("returns hasAccess=false for status='past_due' with no grace period", async () => {
    const supabase = makeMockSupabase({
      plan_id: "pro",
      status: "past_due",
      current_period_end: null,
      grace_period_end: null, // no grace window
    });
    const result = await getSubscriptionStatus(supabase, "user-001");
    expect(result.hasAccess).toBe(false);
    expect(result.failOpen).toBe(false);
    expect(result.status).toBe("past_due");
    expect(result.currentPeriodEnd).toBeNull();
    expect(result.inGracePeriod).toBe(false);
  });

  // ── Grace period tests ─────────────────────────────────────────────────────

  it("past_due WITHIN grace period → hasAccess=true, inGracePeriod=true", async () => {
    // grace_period_end is 3 days from now (still open)
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const supabase = makeMockSupabase({
      plan_id: "starter",
      status: "past_due",
      current_period_end: null,
      grace_period_end: future,
      billing_issue_at: "2026-09-10T10:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-grace");
    expect(result.hasAccess).toBe(true);
    expect(result.inGracePeriod).toBe(true);
    expect(result.gracePeriodEnd).toBe(future);
    expect(result.billingIssueAt).toBe("2026-09-10T10:00:00Z");
    expect(result.failOpen).toBe(false);
  });

  it("past_due AFTER grace period expired → hasAccess=false", async () => {
    // grace_period_end is in the past
    const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const supabase = makeMockSupabase({
      plan_id: "starter",
      status: "past_due",
      current_period_end: null,
      grace_period_end: past,
      billing_issue_at: "2026-09-07T10:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-expired-grace");
    expect(result.hasAccess).toBe(false);
    expect(result.inGracePeriod).toBe(false);
    expect(result.billingIssueAt).toBe("2026-09-07T10:00:00Z");
  });

  // ── Cancellation at period end tests ──────────────────────────────────────

  it("cancelled but current_period_end in the future → hasAccess=true (paid period not over)", async () => {
    // User cancelled but paid until next month — correct behaviour
    const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    const supabase = makeMockSupabase({
      plan_id: "pro",
      status: "cancelled",
      current_period_end: future,
      cancelled_at: "2026-09-11T00:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-cancel-future");
    // Access must continue until the period they already paid for ends
    expect(result.hasAccess).toBe(true);
    expect(result.status).toBe("cancelled");
    expect(result.currentPeriodEnd).toBe(future);
    expect(result.inGracePeriod).toBe(false);
    expect(result.failOpen).toBe(false);
  });

  it("cancelled AND current_period_end in the past → hasAccess=false", async () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const supabase = makeMockSupabase({
      plan_id: "starter",
      status: "cancelled",
      current_period_end: past,
      cancelled_at: "2026-09-08T00:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-cancel-past");
    expect(result.hasAccess).toBe(false);
    expect(result.status).toBe("cancelled");
  });

  // ── Fail-closed on infrastructure errors ─────────────────────────────────

  it("gracefully handles DB error — fails CLOSED (no free premium unlock)", async () => {
    const supabase = makeMockSupabase(null, { message: "relation does not exist" });
    const result = await getSubscriptionStatus(supabase, "user-xyz");
    expect(result.hasAccess).toBe(false);
    expect(result.failOpen).toBe(false);
    expect(result.status).toBeNull();
    expect(result.inGracePeriod).toBe(false);
  });

  it("gracefully handles unexpected exception — fails CLOSED", async () => {
    const supabase = makeThrowingSupabase();
    const result = await getSubscriptionStatus(supabase, "user-abc");
    expect(result.hasAccess).toBe(false);
    expect(result.failOpen).toBe(false);
  });

  it("returns isNew=true and fails CLOSED when no subscription row exists", async () => {
    const supabase = makeMockSupabase(null);
    const result = await getSubscriptionStatus(supabase, "new-user");
    expect(result.hasAccess).toBe(false);
    expect(result.failOpen).toBe(false);
    expect(result.status).toBeNull();
    expect(result.planId).toBeNull();
    expect(result.isNew).toBe(true);
    expect(result.inGracePeriod).toBe(false);
    expect(result.billingIssueAt).toBeNull();
  });

  it("starter plan has correct planId", async () => {
    const supabase = makeMockSupabase({
      plan_id: "starter",
      status: "active",
      current_period_end: "2027-01-01T00:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-s");
    expect(result.planId).toBe("starter");
  });

  it("pro plan has correct planId", async () => {
    const supabase = makeMockSupabase({
      plan_id: "pro",
      status: "active",
      current_period_end: "2027-01-01T00:00:00Z",
    });
    const result = await getSubscriptionStatus(supabase, "user-p");
    expect(result.planId).toBe("pro");
  });
});

// ── computeGracePeriodEnd helper tests ────────────────────────────────────────

describe("computeGracePeriodEnd", () => {
  it("defaults to 3 days from now", () => {
    const before = Date.now();
    const result = computeGracePeriodEnd();
    const after  = Date.now();

    const expected = new Date(before + 3 * 24 * 60 * 60 * 1000);
    const actual   = new Date(result);

    // Allow up to 1 second of test execution time
    expect(actual.getTime()).toBeGreaterThanOrEqual(expected.getTime() - 1000);
    expect(actual.getTime()).toBeLessThanOrEqual(new Date(after + 3 * 24 * 60 * 60 * 1000 + 1000).getTime());
  });

  it("respects a custom failure time", () => {
    const failureTime = new Date("2026-09-11T12:00:00Z");
    const result = computeGracePeriodEnd(failureTime);

    // With default 3-day grace period
    const expected = new Date("2026-09-14T12:00:00Z");
    expect(new Date(result).getTime()).toBe(expected.getTime());
  });
});
