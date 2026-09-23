/**
 * Free-tier / zero extra-cost infra guardrails (Faz 1).
 *
 * Paid stack (AWS ECS Fargate, CapSolver, residential proxies, Sentry Pro) stays
 * deferred. Redis/BullMQ is OPTIONAL: set REDIS_URL to enable
 * `lib/queue.ts` (+ `npm run scrape-worker`, DLQ `truemargin-scrape-dlq`)
 * and `/api/admin/queues`. Without Redis, Postgres scrape_leases + sync scrape remain.
 */

/** Max concurrent live scrapes per marketplace (see migration 0029). */
export const FREE_TIER_MAX_SCRAPE_SLOTS = 2;

/**
 * Allowed Vercel cron paths — must match vercel.json.
 * Do not add paths that imply a new long-running paid worker.
 */
export const FREE_TIER_CRON_PATHS = [
  "/api/cron/sync-marketplaces",
  "/api/cron/compute-benchmarks",
  "/api/cron/precrawl-visibility",
  "/api/cron/weekly-digest",
] as const;

/** Explicitly deferred paid infrastructure (do not wire env for these yet). */
export const DEFERRED_PAID_INFRA = [
  "AWS ECS Fargate",
  "CapSolver / 2Captcha",
  "Residential / rotating proxies",
  "Sentry Pro / Datadog",
] as const;
