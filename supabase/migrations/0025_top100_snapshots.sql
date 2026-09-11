-- 0025 — top100_snapshots + top100_items
--
-- Why separate from category_trends (0018)?
--   category_trends = one aggregate row per (marketplace, keyword, scrape run):
--     median_price, price_p25/p75, sample_size — useful for trend history.
--   top100_* = product-level ranking (one row per ITEM per snapshot):
--     individual title, price, review count, demand estimate per position.
--   These are two distinct granularities. category_trends stays for trend
--   analysis; this table serves the Top 100 product-level ranking feature.
--
-- RLS: Public read (aggregate market data, no PII — same policy as category_trends).
--   Service-role writes from the cron/scraper. No user-scoped data stored here.
--
-- top100_snapshots — one row per (marketplace, keyword, scrape run)
-- top100_items     — one row per ranked product in a snapshot
--
-- STATUS: NOT YET APPLIED — apply only after approval.

create table if not exists public.top100_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  marketplace           text not null,
  keyword               text not null,
  item_count            int  not null default 0,
  -- Aggregate price stats (mirrors Top100AnalysisResult.priceStats)
  price_p25             numeric,
  price_p50             numeric,
  price_p75             numeric,
  price_min             numeric,
  price_max             numeric,
  -- Review stats (null when <10 items had review counts)
  review_p25            numeric,
  review_p50            numeric,
  review_p75            numeric,
  -- Competitive entry barrier: median reviews of top-20 items
  entry_barrier_reviews int,
  -- Analysis quality
  aggregate_confidence  int not null default 0 check (aggregate_confidence between 0 and 100),
  is_partial            boolean not null default false,
  scraped_at            timestamptz not null default now()
);

create index if not exists top100_snapshots_lookup_idx
  on public.top100_snapshots(marketplace, keyword, scraped_at desc);

-- top100_items — product-level rows linked to a snapshot
create table if not exists public.top100_items (
  id                       uuid primary key default gen_random_uuid(),
  snapshot_id              uuid not null references public.top100_snapshots(id) on delete cascade,
  rank                     int  not null,
  title                    text not null,
  price                    numeric not null,
  currency                 text not null default 'TRY',
  review_count             int,
  -- Per-item demand estimate (from estimateDemand({ price: ... }))
  demand_range_low         int  not null default 0,
  demand_range_high        int  not null default 0,
  demand_confidence        int  not null default 0 check (demand_confidence between 0 and 100),
  demand_confidence_level  text not null default 'low'
    check (demand_confidence_level in ('high', 'medium', 'low'))
);

create index if not exists top100_items_snapshot_rank_idx
  on public.top100_items(snapshot_id, rank);

-- ── RLS: public read, service-role write ─────────────────────────────────────

alter table public.top100_snapshots enable row level security;
alter table public.top100_items enable row level security;

create policy "public read top100 snapshots"
  on public.top100_snapshots for select using (true);

create policy "public read top100 items"
  on public.top100_items for select using (true);

-- Writes are service-role only (no RLS policy for INSERT from browser).
-- The scraper cron uses the service-role key which bypasses RLS.
