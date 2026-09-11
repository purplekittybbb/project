-- ─────────────────────────────────────────────────────────────────────────────
-- 0015 — product_costs
--
-- Per-SKU cost profile the seller maintains, used to ENRICH live-synced rows.
-- A marketplace API can only return order-side figures; it reports COGS,
-- shipping, return rate, ad spend and packaging as 0. lib/calc/enrich.ts fills
-- those gaps from this table (per-unit fields × units), never overwriting a
-- value a CSV/manual entry already supplied.
--
-- One row per (user_id, marketplace, sku). RLS: full own-row CRUD (a seller
-- edits their own cost profile).
--
-- Safe to re-run: IF NOT EXISTS + drop/create policy.
--
-- STATUS: written, NOT YET APPLIED to production — apply only after approval.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.product_costs (
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marketplace         text not null default 'trendyol',
  sku                 text not null,
  unit_cost           numeric not null default 0,
  shipping_per_unit   numeric not null default 0,
  return_rate         numeric not null default 0,
  ad_spend_per_unit   numeric not null default 0,
  packaging_per_unit  numeric not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (user_id, marketplace, sku)
);

create index if not exists product_costs_user_idx
  on public.product_costs (user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.product_costs enable row level security;

drop policy if exists "select own product costs" on public.product_costs;
create policy "select own product costs"
  on public.product_costs
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own product costs" on public.product_costs;
create policy "insert own product costs"
  on public.product_costs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own product costs" on public.product_costs;
create policy "update own product costs"
  on public.product_costs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own product costs" on public.product_costs;
create policy "delete own product costs"
  on public.product_costs
  for delete
  using (auth.uid() = user_id);
