-- 0018 — category_trends
-- Aggregated category-level price/volume data scraped from marketplace search pages.
-- Not user-scoped (shared, public-read). Written by the scraping cron.
-- STATUS: NOT YET APPLIED — apply only after approval.
create table if not exists public.category_trends (
  id                  uuid primary key default gen_random_uuid(),
  marketplace         text not null,
  category_name       text not null,
  keyword             text not null,
  median_price        numeric not null,
  currency            text not null default 'TRY',
  top_rank_review_count integer,
  price_p25           numeric not null,
  price_p50           numeric not null,
  price_p75           numeric not null,
  sample_size         integer not null,
  scraped_at          timestamptz not null default now()
);
create index if not exists category_trends_keyword_idx on public.category_trends(marketplace, keyword, scraped_at desc);
alter table public.category_trends enable row level security;
-- Public read (k-anonymous aggregates, no PII):
create policy "public read category trends" on public.category_trends for select using (true);
