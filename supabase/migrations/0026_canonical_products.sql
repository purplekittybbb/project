-- Migration 0026 — canonical_products cache table
--
-- Stores the cross-marketplace canonical product view derived from
-- user_transactions grouped by barcode (EAN/GTIN).
--
-- Additive only: new table, no changes to existing tables.
-- Safe to apply without downtime.

create table if not exists public.canonical_products (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  barcode               text        not null,
  canonical_title       text        not null,
  marketplace_count     int         not null default 0,
  price_spread          numeric     not null default 0,
  best_marketplace      text,
  has_price_inconsistency boolean   not null default false,
  inconsistency_spread  numeric,
  cheapest_marketplace  text,
  expensive_marketplace text,
  inconsistency_suggestion text,
  computed_at           timestamptz not null default now(),
  unique (user_id, barcode)
);

-- Index for per-user lookups
create index if not exists canonical_products_user_id_idx
  on public.canonical_products (user_id);

-- Index for inconsistency reports (show flagged products first)
create index if not exists canonical_products_inconsistency_idx
  on public.canonical_products (user_id, has_price_inconsistency)
  where has_price_inconsistency = true;

-- RLS: users only see their own canonical products
alter table public.canonical_products enable row level security;

create policy "Users can read their own canonical products"
  on public.canonical_products for select
  using (auth.uid() = user_id);

create policy "Service role can manage canonical products"
  on public.canonical_products for all
  using (true)
  with check (true);
