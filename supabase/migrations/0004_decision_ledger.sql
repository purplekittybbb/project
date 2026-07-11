-- ─────────────────────────────────────────────────────────────────────────────
-- decision_ledger
--
-- The real, per-user replacement for the in-memory decision ledger the History
-- tab used to rebuild from 3 seed sellers on every render (see lib/domain/ledger.ts
-- InMemoryLedger — still used by the seed-data /demo walkthrough, unchanged).
-- Every time a signed-in user's real underwriting decision is (re)computed with
-- a materially different result, app/api/ledger/record writes ONE row here.
--
-- Append-only by construction: RLS grants this table SELECT and INSERT only —
-- there is no UPDATE or DELETE policy, so no client (not even the row's own
-- owner) can rewrite or remove history through the API. This is what makes
-- the ledger an actual audit trail instead of a claim in a comment.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.decision_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id      text not null,
  approved_limit numeric not null,
  take_rate      numeric not null,
  currency       text not null,
  model_version  text not null,
  recorded_at    timestamptz not null default now()
);

-- Rows are always read back ordered by (user_id, recorded_at) — the display
-- "#seq" in the UI is just that ordering's row number, not a stored column,
-- so there's no shared counter to race on concurrent writers.
create index if not exists decision_ledger_user_recorded_idx
  on public.decision_ledger (user_id, recorded_at);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.decision_ledger enable row level security;

drop policy if exists "select own ledger entries" on public.decision_ledger;
create policy "select own ledger entries"
  on public.decision_ledger
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own ledger entries" on public.decision_ledger;
create policy "insert own ledger entries"
  on public.decision_ledger
  for insert
  with check (auth.uid() = user_id);

-- Deliberately no "update"/"delete" policy — see the header comment. With RLS
-- enabled and no matching policy, Postgres denies those statements outright,
-- for every role including the row's own owner.
