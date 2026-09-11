-- 0016 — visibility_checks
-- Stores the result of a product rank check on a marketplace search results page.
-- STATUS: NOT YET APPLIED — apply only after approval.
create table if not exists public.visibility_checks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tenant_id           text not null,
  marketplace         text not null,
  sku                 text not null,
  keyword             text not null,
  rank                integer,      -- null = not found
  page                integer,
  is_indexed          boolean not null default false,
  is_on_first_page    boolean not null default false,
  search_result_count integer,
  checked_at          timestamptz not null default now()
);
create index if not exists visibility_checks_user_sku_idx on public.visibility_checks(user_id, sku, checked_at desc);
alter table public.visibility_checks enable row level security;
create policy "select own visibility checks" on public.visibility_checks for select using (auth.uid() = user_id);
create policy "insert own visibility checks" on public.visibility_checks for insert with check (auth.uid() = user_id);
-- No delete/update — append-only history.
