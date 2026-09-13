-- 0029 — scrape concurrency guard
--
-- Problem: guest tool traffic can spike to many simultaneous DIFFERENT
-- keywords (100% cache-miss). Without a cross-instance limit, every Vercel
-- serverless invocation would open its own headless browser and hammer the
-- marketplace at once — the exact "bulk request" pattern the project rules
-- forbid, and a fast path to an IP ban.
--
-- Design: a tiny lease table + one Postgres function pair, called from the
-- API route before opening a browser session. Each in-flight live scrape
-- holds one lease row for its marketplace; a new scrape may only start if
-- fewer than N leases are currently active for that marketplace. Leases
-- older than p_ttl_seconds are swept as stale (covers a crashed/timed-out
-- function that never released its slot) so the system self-heals without
-- a cron. pg_advisory_xact_lock makes count-then-insert atomic under
-- concurrent callers.
--
-- Additive only: new table + two new functions. Touches no existing table.
--
-- STATUS: WRITTEN, NOT APPLIED — apply only after explicit approval of this SQL.

create table if not exists public.scrape_leases (
  id           uuid primary key default gen_random_uuid(),
  marketplace  text not null,
  started_at   timestamptz not null default now()
);

create index if not exists scrape_leases_marketplace_idx
  on public.scrape_leases (marketplace, started_at);

alter table public.scrape_leases enable row level security;
-- No public policies — table is only touched through the SECURITY DEFINER
-- functions below, never directly by anon/authenticated clients.

-- ── acquire: returns a lease id (uuid) on success, null if at capacity ────

create or replace function public.try_acquire_scrape_slot(
  p_marketplace text,
  p_max integer,
  p_ttl_seconds integer default 180
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease_id uuid;
  v_active_count integer;
begin
  -- Serialize acquire attempts per marketplace so concurrent callers can't
  -- both read "count < max" before either has inserted.
  perform pg_advisory_xact_lock(hashtext('scrape_slot:' || p_marketplace));

  delete from public.scrape_leases
  where marketplace = p_marketplace
    and started_at < now() - (p_ttl_seconds || ' seconds')::interval;

  select count(*) into v_active_count
  from public.scrape_leases
  where marketplace = p_marketplace;

  if v_active_count >= p_max then
    return null;
  end if;

  insert into public.scrape_leases (marketplace)
  values (p_marketplace)
  returning id into v_lease_id;

  return v_lease_id;
end;
$$;

-- ── release: always safe to call, even with a stale/already-swept id ──────

create or replace function public.release_scrape_slot(p_lease_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scrape_leases where id = p_lease_id;
$$;

grant execute on function public.try_acquire_scrape_slot(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.release_scrape_slot(uuid) to anon, authenticated, service_role;
