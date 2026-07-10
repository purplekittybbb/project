-- ─────────────────────────────────────────────────────────────────────────────
-- user_transactions
--
-- Per-user marketplace sales rows (Trendyol-style fee model). Each row belongs to
-- exactly one authenticated user. Row-Level Security guarantees a user can only
-- read/insert/update/delete THEIR OWN rows — enforced by Postgres, not the client.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id      text not null default '',
  sku           text not null,
  category      text not null default 'Diğer',
  sale_date     date not null,
  units         integer not null default 1,
  gross_revenue numeric not null default 0,
  unit_cost     numeric not null default 0,
  shipping      numeric not null default 0,
  return_rate   numeric not null default 0,
  ad_spend      numeric not null default 0,
  marketplace   text not null default 'trendyol',
  created_at    timestamptz not null default now()
);

-- Fast lookups of "my rows".
create index if not exists user_transactions_user_id_idx
  on public.user_transactions (user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.user_transactions enable row level security;

-- Each policy scopes access to the caller's own rows via auth.uid().

drop policy if exists "select own rows" on public.user_transactions;
create policy "select own rows"
  on public.user_transactions
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own rows" on public.user_transactions;
create policy "insert own rows"
  on public.user_transactions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own rows" on public.user_transactions;
create policy "update own rows"
  on public.user_transactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own rows" on public.user_transactions;
create policy "delete own rows"
  on public.user_transactions
  for delete
  using (auth.uid() = user_id);
