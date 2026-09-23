/**
 * Exponential backoff delays for scrape / BullMQ jobs.
 * Attempt failures wait: 2s → 4s → 8s (then capped).
 */
export const SCRAPE_BACKOFF_BASE_MS = 2_000;
export const SCRAPE_BACKOFF_FACTOR = 2;
export const SCRAPE_BACKOFF_MAX_MS = 60_000;

/** Delay before retry attempt `attempt` (1-based). */
export function exponentialBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = SCRAPE_BACKOFF_BASE_MS * SCRAPE_BACKOFF_FACTOR ** (n - 1);
  return Math.min(SCRAPE_BACKOFF_MAX_MS, raw);
}

/**
 * BullMQ settings: delay doubles each failure (2s, 4s, 8s…).
 * attempts=4 → 1 initial try + up to 3 retries covering 2s/4s/8s waits.
 */
export const SCRAPE_JOB_BACKOFF = {
  type: "exponential" as const,
  delay: SCRAPE_BACKOFF_BASE_MS,
};

export const SCRAPE_JOB_ATTEMPTS = 4;
