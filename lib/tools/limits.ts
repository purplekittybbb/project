/** Daily query limits for standalone (guest) tools. */

export const GUEST_DAILY_LIMIT = 2;
export const AUTH_NO_STORE_DAILY_LIMIT = 10;
/**
 * Signed-in AND on an active/trialing subscription (Başlangıç or Profesyonel).
 * This is the one concrete, already-shipped lever that ties paying for
 * TrueMargin to a real, higher limit on the standalone tools — see the audit
 * finding that /api/demand and /api/top100 in proxy.ts PREMIUM_PREFIXES
 * don't correspond to any real route, so paying customers previously got
 * nothing extra here. Deliberately generous (not "unlimited") — still a real
 * ceiling for anti-bot/scraping cost reasons, but far above the free tier.
 */
export const PAID_DAILY_LIMIT = 50;

export function dailyLimitForSubject(subjectType: "ip" | "user", isPaid = false): number {
  if (subjectType !== "user") return GUEST_DAILY_LIMIT;
  return isPaid ? PAID_DAILY_LIMIT : AUTH_NO_STORE_DAILY_LIMIT;
}
