-- 0031 — shared result cache for price-track and top100 guest tools
--
-- Same public-cache pattern as 0027 (shared_visibility_scans), extended to
-- the two remaining scraper tools that were NOT cached yet: Fiyat Takibi
-- (price-track) and Top100 Analiz (top100).
--
-- Unlike visibility (a handful of scalar fields), these two tools return a
-- variable-length list (up to 50 prices / 100 ranked items) plus derived
-- stats. Modeling every field as its own column would mean re-deriving the
-- exact TypeScript shape in SQL and keeping both in lockstep forever. Instead
-- the full result object (already fully JSON-serializable — see
-- PriceTrackResult / Top100AnalysisResult in lib/scrapers/price-tracker.ts
-- and lib/demand/top100.ts) is stored as-is in a `result` jsonb column and
-- served back verbatim. The frontend result panels already consume exactly
-- that shape for LIVE results, so a cache hit needs zero UI changes.
--
-- Additive only: two new tables. Touches nothing else.
--
-- STATUS: WRITTEN, NOT APPLIED — apply only after explicit approval of this SQL.

create table if not exists public.shared_price_track_scans (
  id           uuid primary key default gen_random_uuid(),
  marketplace  text not null,
  keyword      text not null,
  result       jsonb not null,
  scraped_at   timestamptz not null default now(),
  unique (marketplace, keyword)
);

alter table public.shared_price_track_scans enable row level security;

create policy "Anyone can read shared price-track scans"
  on public.shared_price_track_scans for select
  using (true);

create table if not exists public.shared_top100_scans (
  id           uuid primary key default gen_random_uuid(),
  marketplace  text not null,
  keyword      text not null,
  result       jsonb not null,
  scraped_at   timestamptz not null default now(),
  unique (marketplace, keyword)
);

alter table public.shared_top100_scans enable row level security;

create policy "Anyone can read shared top100 scans"
  on public.shared_top100_scans for select
  using (true);

-- Writes stay with the service role (API route write-back + precrawl cron),
-- which bypasses RLS — same as every other shared_* cache table.
