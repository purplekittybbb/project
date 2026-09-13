-- 0032 — pre-crawl run history (observability)
--
-- Purpose: right now the ONLY way to see whether the background pre-crawl
-- worker is doing anything is to read Vercel's raw function logs — not
-- something a non-technical founder can check. This table gives every run
-- a durable row: what it scanned, what it refreshed, what it skipped
-- because the concurrency cap was busy, and any errors. The admin
-- scraper-health endpoint (app/api/admin/scraper-health) reads this to show
-- the last few runs at a glance.
--
-- Additive only: one new table. Touches nothing else.
--
-- STATUS: WRITTEN, NOT APPLIED — apply only after explicit approval of this SQL.

create table if not exists public.precrawl_runs (
  id             uuid primary key default gen_random_uuid(),
  run_at         timestamptz not null default now(),
  scanned        integer not null default 0,
  refreshed      integer not null default 0,
  skipped_busy   integer not null default 0,
  error_count    integer not null default 0,
  -- Per-tool breakdown ({visibility: {...}, "price-track": {...}, top100: {...}})
  -- and the raw error messages (capped in application code before insert).
  details        jsonb not null default '{}'::jsonb
);

create index if not exists precrawl_runs_run_at_idx
  on public.precrawl_runs (run_at desc);

alter table public.precrawl_runs enable row level security;
-- No public policies — only the service role (the cron itself, and the
-- CRON_SECRET-gated admin endpoint) touches this table.

-- Keep this table small automatically: a run every ~15-20 minutes is
-- ~35-95 rows/day: This deletes anything older than 30 days each time a
-- new row is written, so it never needs a separate cleanup job.
create or replace function public.trim_old_precrawl_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.precrawl_runs where run_at < now() - interval '30 days';
  return null;
end;
$$;

drop trigger if exists trim_old_precrawl_runs_trigger on public.precrawl_runs;
create trigger trim_old_precrawl_runs_trigger
  after insert on public.precrawl_runs
  execute function public.trim_old_precrawl_runs();
