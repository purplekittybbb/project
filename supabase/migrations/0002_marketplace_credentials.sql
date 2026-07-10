-- ─────────────────────────────────────────────────────────────────────────────
-- marketplace_credentials
--
-- A signed-in user's real marketplace API credentials (currently: Trendyol),
-- stored encrypted (see lib/security/crypto.ts — AES-256-GCM, server-only
-- key). Row-Level Security guarantees a user can only read/insert/update/
-- delete THEIR OWN credentials — enforced by Postgres, not the client.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.marketplace_credentials (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marketplace           text not null,
  seller_id             text not null,
  api_key_encrypted     text not null,
  api_secret_encrypted  text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, marketplace)
);

create index if not exists marketplace_credentials_user_id_idx
  on public.marketplace_credentials (user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.marketplace_credentials enable row level security;

drop policy if exists "select own credentials" on public.marketplace_credentials;
create policy "select own credentials"
  on public.marketplace_credentials
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own credentials" on public.marketplace_credentials;
create policy "insert own credentials"
  on public.marketplace_credentials
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own credentials" on public.marketplace_credentials;
create policy "update own credentials"
  on public.marketplace_credentials
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own credentials" on public.marketplace_credentials;
create policy "delete own credentials"
  on public.marketplace_credentials
  for delete
  using (auth.uid() = user_id);
