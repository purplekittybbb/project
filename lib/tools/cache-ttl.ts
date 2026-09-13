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

/**
 * Stale-while-revalidate grace window, as a multiple of the TTL above.
 *
 * Once a cached row passes its TTL but is still within TTL * this multiple,
 * run-standalone.ts serves it INSTANTLY (mode: "stale", honestly labelled —
 * never silently passed off as fresh) instead of making the visitor wait
 * ~60-90s for a live scrape, and schedules a background refresh (via
 * next/server's after(), no extra visitor wait) so the NEXT visitor gets a
 * fresh row. This only ever fires for long-tail keywords the pre-crawl
 * worker hasn't reached yet — in steady state most rows are refreshed well
 * before they even hit the base TTL. Past this window the row is too old to
 * hand out honestly, so it's treated as a real cache miss (live/queued).
 */
export const STALE_GRACE_MULTIPLIER = 3;
