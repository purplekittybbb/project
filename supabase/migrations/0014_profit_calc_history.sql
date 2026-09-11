-- ─────────────────────────────────────────────────────────────────────────────
-- 0014 — profit_calc_history
--
-- Append-only audit trail of profit CALCULATIONS (margin/net-profit snapshots).
-- Deliberately SEPARATE from decision_ledger (0004), which records underwriting
-- CREDIT decisions — this table records "what did we compute the profit to be,
-- and when", so a seller can see how their true margin evolved over time.
--
-- Append-only by construction: RLS grants SELECT and INSERT only — no UPDATE or
-- DELETE policy, so history can never be rewritten through the API (same design
-- as decision_ledger).
--
-- Safe to re-run: IF NOT EXISTS + drop/create policy.
--
-- STATUS: written, NOT YET APPLIED to production — apply only after approval.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profit_calc_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id         text not null,
  marketplace       text not null default 'combined',
  -- null sku = a portfolio-level (aggregate) snapshot; set = one SKU.
  sku               text,
  currency          text not null default 'TRY',
  gross_revenue     numeric not null,
  net_profit        numeric not null,
  net_margin_pct    numeric not null,
  total_deductions  numeric not null,
  -- Full fee/cost waterfall as computed, for later drill-down.
  breakdown         jsonb not null default '{}'::jsonb,
  computed_at       timestamptz not null default now()
);

-- Read pattern: a user's snapshots over time (optionally by sku), newest-first.
create index if not exists profit_calc_history_user_computed_idx
  on public.profit_calc_history (user_id, computed_at desc);

create index if not exists profit_calc_history_user_sku_idx
  on public.profit_calc_history (user_id, sku);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.profit_calc_history enable row level security;

drop policy if exists "select own profit history" on public.profit_calc_history;
create policy "select own profit history"
  on public.profit_calc_history
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own profit history" on public.profit_calc_history;
create policy "insert own profit history"
  on public.profit_calc_history
  for insert
  with check (auth.uid() = user_id);

-- Deliberately no update/delete policy — append-only audit trail.
