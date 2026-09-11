/** Daily query limits for standalone (guest) tools. */

export const GUEST_DAILY_LIMIT = 2;
export const AUTH_NO_STORE_DAILY_LIMIT = 10;

export function dailyLimitForSubject(subjectType: "ip" | "user"): number {
  return subjectType === "user" ? AUTH_NO_STORE_DAILY_LIMIT : GUEST_DAILY_LIMIT;
}
