-- 0027 — shared visibility scans + per-user watches
--
-- Scale architecture (approved design): the public scan RESULT is shared
-- across tenants; WHO is watching a SKU/keyword stays user-private.
--
-- Additive:
--   * new table public.shared_visibility_scans
--   * new table public.visibility_watches
--   * nullable column visibility_checks.shared_scan_id (FK, ON DELETE SET NULL)
--
-- Does NOT drop, rewrite, or change RLS on existing visibility_checks rows.
-- Dual-write cron keeps appending to visibility_checks as before.
--
-- sku is stored as text not null default '' (empty = keyword-only / no SKU)
-- so UNIQUE (marketplace, keyword, sku) works with PostgREST ON CONFLICT.
-- Application maps null ↔ ''.
--
-- STATUS: WRITTEN, NOT APPLIED — apply only after explicit approval of this SQL.

-- ── shared results (no user_id — public marketplace fact) ─────────────────

create table if not exists public.shared_visibility_scans (
  id                   uuid primary key default gen_random_uuid(),
  marketplace          text not null,
  keyword              text not null,
  sku                  text not null default '',
  rank                 integer,
  page                 integer,
  is_indexed           boolean not null default false,
  is_on_first_page     boolean not null default false,
  search_result_count  integer,
  scraped_at           timestamptz not null default now(),
  unique (marketplace, keyword, sku)
);

create index if not exists shared_visibility_scans_marketplace_keyword_idx
  on public.shared_visibility_scans (marketplace, keyword, scraped_at desc);

alter table public.shared_visibility_scans enable row level security;

-- Public read: rank of a marketplace search is not tenant-private.
-- Writes stay with the service role (cron), which bypasses RLS.
create policy "Anyone can read shared visibility scans"
  on public.shared_visibility_scans for select
  using (true);

-- ── per-user watch list (WHO is tracking what — private) ──────────────────

create table if not exists public.visibility_watches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tenant_id    text not null,
  marketplace  text not null,
  sku          text not null default '',
  keyword      text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, marketplace, sku, keyword)
);

create index if not exists visibility_watches_user_idx
  on public.visibility_watches (user_id, marketplace);

alter table public.visibility_watches enable row level security;

create policy "Users can read their own visibility watches"
  on public.visibility_watches for select
  using (auth.uid() = user_id);

create policy "Users can insert their own visibility watches"
  on public.visibility_watches for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own visibility watches"
  on public.visibility_watches for delete
  using (auth.uid() = user_id);

-- ── back-compat pointer on the existing append-only history table ─────────

alter table public.visibility_checks
  add column if not exists shared_scan_id uuid
    references public.shared_visibility_scans(id) on delete set null;

create index if not exists visibility_checks_shared_scan_idx
  on public.visibility_checks (shared_scan_id)
  where shared_scan_id is not null;
