-- ─────────────────────────────────────────────────────────────────────────────
-- 0038 — RLS hardening (sıfır ekstra maliyet Faz 1)
--
-- Audit findings (0001–0037):
--   * User-scoped tables mostly follow auth.uid() = user_id correctly.
--   * Shared/public-read caches (shared_*, top100_*, category_trends,
--     competitor_price_history) correctly allow SELECT only; writes rely on
--     service-role bypass.
--   * Service-role-only tables (guest_tool_usage, scrape_leases,
--     keyword_search_stats, precrawl_runs) have RLS ON and no anon policies —
--     intentional; left documented, not changed.
--
-- Fixes in this migration:
--   1. canonical_products had "Service role can manage … FOR ALL USING (true)".
--      Service role already bypasses RLS; that policy let ANY role write any
--      row. Drop it and add owner-scoped write policies.
--   2. iyzico_subscriptions allowed authenticated INSERT/UPDATE (users could
--      self-set status=active). Writes are only via service-role callback —
--      keep SELECT for the owner; drop user write policies.
--
-- billing_subscriptions user INSERT/UPDATE kept on purpose: demo trial +
-- Stripe setup-intent routes use the user-scoped anon client.
--
-- Free-tier note: no AWS/Redis/proxy objects. Apply in Supabase SQL editor
-- (Free project) when ready.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. canonical_products ────────────────────────────────────────────────────

drop policy if exists "Service role can manage canonical products"
  on public.canonical_products;

drop policy if exists "Users can insert their own canonical products"
  on public.canonical_products;
create policy "Users can insert their own canonical products"
  on public.canonical_products
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own canonical products"
  on public.canonical_products;
create policy "Users can update their own canonical products"
  on public.canonical_products
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own canonical products"
  on public.canonical_products;
create policy "Users can delete their own canonical products"
  on public.canonical_products
  for delete
  using (auth.uid() = user_id);

-- ── 2. iyzico_subscriptions — select-only for end users ──────────────────────

drop policy if exists "insert own subscriptions" on public.iyzico_subscriptions;
drop policy if exists "update own subscriptions" on public.iyzico_subscriptions;

-- select own subscriptions (0021) remains.

-- ── 3. Re-assert RLS on service-role-only tables (idempotent) ────────────────

alter table if exists public.guest_tool_usage enable row level security;
alter table if exists public.scrape_leases enable row level security;
alter table if exists public.keyword_search_stats enable row level security;
alter table if exists public.precrawl_runs enable row level security;

-- Shared caches: public SELECT stays; no INSERT/UPDATE/DELETE for anon/auth.
alter table if exists public.shared_visibility_scans enable row level security;
alter table if exists public.shared_price_track_scans enable row level security;
alter table if exists public.shared_top100_scans enable row level security;
