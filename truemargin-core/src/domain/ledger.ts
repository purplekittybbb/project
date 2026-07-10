/**
 * Append-only, immutable ledger.
 *
 * Every raw ingested record and every underwriting decision is written here and
 * never mutated or deleted. This is the small, honest version of Parafin's
 * "immutable, double-entry ledger" — the audit trail investors' due diligence
 * looks for, and the store of the "decision traces" that form the real moat.
 *
 * The app layer can swap the sink for SQLite/Postgres; the domain core stays pure
 * by writing through an append-only interface.
 */

import type { UnderwritingDecision } from "./canonical.js";

export interface LedgerEntry<T> {
  seq: number; // monotonic sequence, assigned on append
  recordedAt: string; // ISO timestamp of the append
  kind: string;
  payload: T;
}

export interface AppendOnlySink {
  append<T>(kind: string, payload: T): LedgerEntry<T>;
  all(): ReadonlyArray<LedgerEntry<unknown>>;
}

/**
 * In-memory append-only sink. Entries are frozen on write so callers cannot
 * mutate history. Suitable for the demo and tests; production swaps the sink.
 */
export class InMemoryLedger implements AppendOnlySink {
  private readonly entries: LedgerEntry<unknown>[] = [];

  append<T>(kind: string, payload: T): LedgerEntry<T> {
    const entry: LedgerEntry<T> = Object.freeze({
      seq: this.entries.length + 1,
      recordedAt: new Date().toISOString(),
      kind,
      payload,
    });
    this.entries.push(entry);
    return entry;
  }

  all(): ReadonlyArray<LedgerEntry<unknown>> {
    return this.entries.slice();
  }
}

/** Convenience helper: record an underwriting decision as a decision trace. */
export function recordDecision(
  sink: AppendOnlySink,
  decision: UnderwritingDecision
): LedgerEntry<UnderwritingDecision> {
  return sink.append("underwriting_decision", decision);
}
