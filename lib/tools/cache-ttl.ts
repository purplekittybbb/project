/**
 * Single source of truth for how long each shared cache table is considered
 * "fresh" — used by run-standalone.ts (read side: serve from cache while
 * fresh), the pre-crawl cron (refresh side: proactively refresh before this
 * expires), and the admin scraper-health endpoint (reporting side: how many
 * rows are currently fresh vs stale). Keeping this in one file means all
 * three always agree — no drift between "when a visitor stops getting the
 * cached answer" and "when the worker thinks it needs to refresh it".
 */

export const VISIBILITY_TTL_MS = 6 * 60 * 60 * 1000; // 6h — rank is fairly stable across a day.
export const PRICE_TRACK_TTL_MS = 3 * 60 * 60 * 1000; // 3h — prices move faster than rank.
export const TOP100_TTL_MS = 6 * 60 * 60 * 1000; // 6h — category composition changes slowly.
