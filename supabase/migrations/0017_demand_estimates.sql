-- 0017 — demand_estimates
-- Append-only demand estimate snapshots per (user, marketplace, sku).
-- STATUS: NOT YET APPLIED — apply only after approval.
create table if not exists public.demand_estimates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tenant_id         text not null,
  marketplace       text not null,
  sku               text not null,
  range_low         numeric not null,
  range_high        numeric not null,
  confidence_score  integer not null check (confidence_score between 0 and 100),
  confidence_level  text not null check (confidence_level in ('high','medium','low')),
  signals_used      text[] not null default '{}',
  explanation       text not null default '',
  estimated_at      timestamptz not null default now()
);
create index if not exists demand_estimates_user_sku_idx on public.demand_estimates(user_id, sku, estimated_at desc);
alter table public.demand_estimates enable row level security;
create policy "select own demand estimates" on public.demand_estimates for select using (auth.uid() = user_id);
create policy "insert own demand estimates" on public.demand_estimates for insert with check (auth.uid() = user_id);
