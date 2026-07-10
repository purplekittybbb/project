/**
 * Onboarding + free-trial state (client-only, localStorage).
 *
 * This is intentionally lightweight and NON-financial: it tracks whether a user
 * has walked the post-login onboarding flow and when their 30-day trial started.
 * No payment is taken anywhere (Stripe is not wired) — the card step is a demo.
 *
 * SSR-safe: every accessor guards `typeof window` so it can be imported anywhere.
 */

const DONE_KEY = "tm_onboarding_done";
const TRIAL_START_KEY = "tm_trial_start";
const CONNECT_KEY = "tm_connect_method";
const MARKETPLACES_KEY = "tm_connected_marketplaces";

export const TRIAL_DAYS = 30;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function isOnboardingDone(): boolean {
  if (!hasWindow()) return false;
  return window.localStorage.getItem(DONE_KEY) === "1";
}

/** Marks onboarding complete and starts the trial clock (idempotent on the date). */
export function completeOnboarding(connectMethod?: string): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(DONE_KEY, "1");
  if (!window.localStorage.getItem(TRIAL_START_KEY)) {
    window.localStorage.setItem(TRIAL_START_KEY, new Date().toISOString());
  }
  if (connectMethod) window.localStorage.setItem(CONNECT_KEY, connectMethod);
}

/** Persist the set of connected marketplace ids (multi-select). */
export function setConnectedMarketplaces(ids: string[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(MARKETPLACES_KEY, JSON.stringify(ids));
}

/** The marketplace ids the user connected during onboarding (or added later). */
export function getConnectedMarketplaces(): string[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(MARKETPLACES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** ISO date the trial began, or null if not started. */
export function getTrialStart(): string | null {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(TRIAL_START_KEY);
}

/** Whole days remaining in the 30-day trial (clamped to 0..TRIAL_DAYS). */
export function getTrialDaysLeft(): number {
  const start = getTrialStart();
  if (!start) return TRIAL_DAYS;
  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return TRIAL_DAYS;
  const elapsedDays = Math.floor((Date.now() - startMs) / 86_400_000);
  return Math.max(0, TRIAL_DAYS - elapsedDays);
}

/** How the user connected (marketplace slug or "csv"), if recorded. */
export function getConnectMethod(): string | null {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(CONNECT_KEY);
}

/** Test/reset helper — clears all onboarding state. */
export function resetOnboarding(): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(DONE_KEY);
  window.localStorage.removeItem(TRIAL_START_KEY);
  window.localStorage.removeItem(CONNECT_KEY);
  window.localStorage.removeItem(MARKETPLACES_KEY);
  window.localStorage.removeItem("tm_marketplace_connections");
}
