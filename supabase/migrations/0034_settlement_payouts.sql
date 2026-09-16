-- ─────────────────────────────────────────────────────────────────────────────
-- settlement_payouts
--
-- Hakediş Mutabakatı ("payout reconciliation") — competitor analysis flagged
-- this as the strongest differentiator a rival (KarPanel) has that this
-- product lacked: a line where the SELLER'S OWN reported payout is compared
-- against what the engine computes as the expected payout.
--
-- No adapter in this codebase ingests a real settlement file automatically
-- (see lib/engine.ts's computeSettlementVerification doc comment) — rather
-- than fabricate that, this table lets a signed-in seller MANUALLY log the
-- real amount their marketplace actually paid them for a given period, which
-- the dashboard then compares against its own computed "expected" figure.
-- This is a real, honest reconciliation (both numbers are real), not a model.
--
-- One row per (user, marketplace, period) — re-entering the same period
-- updates the existing row via upsert (see lib/supabase/settlement.ts).
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.settlement_payouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  marketplace    text not null,
  -- "YYYY-MM" — one entry per calendar month per marketplace.
  period_label   text not null,
  actual_amount  numeric not null check (actual_amount >= 0),
  currency       text not null default 'TRY',
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, marketplace, period_label)
);

create index if not exists settlement_payouts_user_idx
  on public.settlement_payouts (user_id, marketplace, period_label);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.settlement_payouts enable row level security;

drop policy if exists "select own settlement payouts" on public.settlement_payouts;
create policy "select own settlement payouts"
  on public.settlement_payouts
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own settlement payouts" on public.settlement_payouts;
create policy "insert own settlement payouts"
  on public.settlement_payouts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own settlement payouts" on public.settlement_payouts;
create policy "update own settlement payouts"
  on public.settlement_payouts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own settlement payouts" on public.settlement_payouts;
create policy "delete own settlement payouts"
  on public.settlement_payouts
  for delete
  using (auth.uid() = user_id);
