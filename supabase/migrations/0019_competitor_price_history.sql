-- 0019 — competitor_price_history
-- Scraped competitor price snapshots (keyword-level, not user-scoped — k-anonymous aggregate).
-- STATUS: NOT YET APPLIED — apply only after approval.
create table if not exists public.competitor_price_history (
  id            uuid primary key default gen_random_uuid(),
  marketplace   text not null,
  keyword       text not null,
  rank          integer not null,
  title         text not null,
  price         numeric not null,
  currency      text not null default 'TRY',
  price_p25     numeric,
  price_p50     numeric,
  price_p75     numeric,
  scraped_at    timestamptz not null default now()
);
create index if not exists competitor_price_keyword_idx on public.competitor_price_history(marketplace, keyword, scraped_at desc);
alter table public.competitor_price_history enable row level security;
-- Public read (aggregate pricing, no PII):
create policy "public read competitor prices" on public.competitor_price_history for select using (true);
