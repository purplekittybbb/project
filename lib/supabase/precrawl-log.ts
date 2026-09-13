/**
 * Pre-crawl run history (migration 0032) — write side used by the cron,
 * read side used by the admin scraper-health endpoint.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PrecrawlRunLog {
  scanned: number;
  refreshed: number;
  skippedBusy: number;
  errorCount: number;
  /** Per-tool breakdown + a capped sample of error messages — kept small. */
  details: Record<string, unknown>;
}

/** Best-effort — a logging failure must never fail the cron itself. */
export async function insertPrecrawlRun(
  supabase: SupabaseClient | null,
  log: PrecrawlRunLog,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("precrawl_runs").insert({
      scanned: log.scanned,
      refreshed: log.refreshed,
      skipped_busy: log.skippedBusy,
      error_count: log.errorCount,
      details: log.details,
    });
  } catch {
    // Observability is best-effort — never let a logging failure break the run.
  }
}

export interface PrecrawlRunRow {
  runAt: string;
  scanned: number;
  refreshed: number;
  skippedBusy: number;
  errorCount: number;
  details: Record<string, unknown>;
}

export async function loadRecentPrecrawlRuns(
  supabase: SupabaseClient,
  limit: number,
): Promise<PrecrawlRunRow[]> {
  const { data, error } = await supabase
    .from("precrawl_runs")
    .select("run_at, scanned, refreshed, skipped_busy, error_count, details")
    .order("run_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    runAt: String(r.run_at),
    scanned: Number(r.scanned ?? 0),
    refreshed: Number(r.refreshed ?? 0),
    skippedBusy: Number(r.skipped_busy ?? 0),
    errorCount: Number(r.error_count ?? 0),
    details: (r.details as Record<string, unknown>) ?? {},
  }));
}
