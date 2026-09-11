-- ─────────────────────────────────────────────────────────────────────────────
-- 0013 — loss_alarms
--
-- Persists the loss alarm that lib/calc/loss-alarm.ts detects automatically, so
-- a money-losing SKU is RECORDED over time instead of only being a transient
-- colour in the dashboard. One row per detected alarm; `resolved_at` lets an
-- alarm be marked cleared once the SKU recovers.
--
-- RLS: a user may read / insert / update ONLY their own alarms (update exists
-- solely so an alarm can be resolved). No delete policy — history is kept.
--
-- Safe to re-run: IF NOT EXISTS + drop/create policy.
--
-- STATUS: written, NOT YET APPLIED to production — apply only after approval.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.loss_alarms (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id             text not null,
  marketplace           text not null default 'trendyol',
  sku                   text not null,
  category              text not null default 'Diğer',
  level                 text not null check (level in ('silent-loss', 'loss', 'thin-margin', 'return-risk')),
  true_margin_pct       numeric not null,
  perceived_margin_pct  numeric not null,
  return_rate_pct       numeric not null default 0,
  is_silent_loser       boolean not null default false,
  message               text not null default '',
  detected_at           timestamptz not null default now(),
  resolved_at           timestamptz
);

-- Read pattern: a user's alarms newest-first, often filtered to unresolved.
create index if not exists loss_alarms_user_detected_idx
  on public.loss_alarms (user_id, detected_at desc);

create index if not exists loss_alarms_user_unresolved_idx
  on public.loss_alarms (user_id)
  where resolved_at is null;

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.loss_alarms enable row level security;

drop policy if exists "select own alarms" on public.loss_alarms;
create policy "select own alarms"
  on public.loss_alarms
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own alarms" on public.loss_alarms;
create policy "insert own alarms"
  on public.loss_alarms
  for insert
  with check (auth.uid() = user_id);

-- Update allowed only to resolve one's own alarm (both USING and WITH CHECK
-- keep it scoped to the owner).
drop policy if exists "update own alarms" on public.loss_alarms;
create policy "update own alarms"
  on public.loss_alarms
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
