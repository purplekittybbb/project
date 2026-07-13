-- ─────────────────────────────────────────────────────────────────────────────
-- sector_benchmarks
--
-- Aggregated, k-anonymous cohort benchmarks — the OUTPUT of the pooling
-- pipeline (lib/benchmarks/*). One row per (marketplace × category × size_bucket
-- × metric). Any dimension may be '*' (ANY), meaning "collapsed" — e.g.
-- ('trendyol','*','small') = "all categories on Trendyol at small size".
--
-- source:
--   'pooled'    → computed from REAL user data by /api/cron/compute-benchmarks.
--                 Only ever written for a segment with >= 5 DISTINCT sellers
--                 (k-anonymity, enforced in lib/benchmarks/aggregate.ts), so no
--                 individual seller's numbers can be reverse-engineered.
--   'published' → representative fallback (lib/benchmarks/published.ts) so a
--                 segment with too few sellers still shows something honest.
--
-- These rows are AGGREGATE and non-sensitive (percentiles over >=5 sellers, plus
-- published estimates), so every authenticated user may read the whole table.
-- Writes happen ONLY via the service-role cron (which bypasses RLS) — there is
-- deliberately no INSERT/UPDATE policy for normal users, so a signed-in user can
-- read benchmarks but can never forge or tamper with them.
--
-- Run this in the Supabase SQL editor (or `supabase db push`) once. Then invoke
-- GET /api/cron/compute-benchmarks (with the CRON_SECRET bearer) — or wait for
-- the scheduled cron — to populate the 'pooled' rows.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sector_benchmarks (
  marketplace   text        not null,
  category      text        not null,
  size_bucket   text        not null,
  metric        text        not null,
  p10           numeric     not null,
  p50           numeric     not null,
  p90           numeric     not null,
  sample_size   integer     not null default 0,
  source        text        not null check (source in ('pooled', 'published')),
  computed_at   timestamptz not null default now(),
  primary key (marketplace, category, size_bucket, metric)
);

-- Primary query pattern: read all (with possible filtering by segment later)
-- Optimized for full-table scan reads and aggregation queries
create index if not exists sector_benchmarks_lookup_idx
  on public.sector_benchmarks (metric, marketplace, category, size_bucket);

-- Maintenance pattern: prune stale rows by computed_at timestamp
-- Used in /api/cron/compute-benchmarks DELETE operation
create index if not exists sector_benchmarks_computed_at_idx
  on public.sector_benchmarks (computed_at desc);

-- Segment filtering: commonly filter by source (pooled vs published)
-- Useful for distinguishing live vs fallback data
create index if not exists sector_benchmarks_source_idx
  on public.sector_benchmarks (source);

-- Composite for marketplace + source filtering
create index if not exists sector_benchmarks_marketplace_source_idx
  on public.sector_benchmarks (marketplace, source);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.sector_benchmarks enable row level security;

-- Any authenticated user may READ benchmarks (aggregate, k-anonymous).
drop policy if exists "read benchmarks" on public.sector_benchmarks;
create policy "read benchmarks"
  on public.sector_benchmarks
  for select
  to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policy for normal users on purpose: writes happen only
-- through the service-role cron, which bypasses RLS. Users can read, never write.
