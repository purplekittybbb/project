/**
 * Structured observability for benchmark fallback paths.
 *
 * Emits single-line JSON after the `[benchmark-fallback]` prefix so log
 * aggregators (Vercel, Datadog, etc.) can filter and alert on cold-start /
 * k-anonymity conditions without parsing free-form messages.
 */

export type BenchmarkFallbackReason =
  | "unmigrated"
  | "empty_table"
  | "query_error"
  | "k_anon_insufficient"
  | "partial_published";

export interface BenchmarkFallbackLog {
  reason: BenchmarkFallbackReason;
  route: string;
  [key: string]: unknown;
}

const PREFIX = "[benchmark-fallback]";

export function logBenchmarkFallback(payload: BenchmarkFallbackLog): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...payload,
  });
  console.warn(`${PREFIX} ${line}`);
}

/** Map a Supabase/PostgREST table-read error to unmigrated vs generic query_error. */
export function classifyBenchmarkTableError(message: string, code?: string): "unmigrated" | "query_error" {
  const m = message.toLowerCase();
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache")
  ) {
    return "unmigrated";
  }
  return "query_error";
}
