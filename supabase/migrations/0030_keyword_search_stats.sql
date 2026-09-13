-- 0030 — keyword search stats + background pre-crawl support
--
-- Purpose: know which (tool, marketplace, keyword) combos guests actually
-- search, so a background worker can refresh the popular ones BEFORE the
-- next visitor asks — instead of only caching reactively after someone
-- already hit a live scrape. This is the "veri toplama motoru" (data
-- collection engine) half of the architecture; the shared_*_scans tables
-- (0027, 0031) are the "serve instantly from cache" half.
--
-- tool_id buckets:
--   'visibility'  — covers BOTH the visibility and index-check tools, since
--                   they read/write the SAME shared_visibility_scans row
--                   (lib/tools/run-standalone.ts). One demand signal, one
--                   cache, one thing for the worker to refresh.
--   'price-track' — shared_price_track_scans (0031)
--   'top100'      — shared_top100_scans (0031)
--
-- Additive only: one new table + one new function. Touches nothing else.
--
-- STATUS: WRITTEN, NOT APPLIED — apply only after explicit approval of this SQL.

create table if not exists public.keyword_search_stats (
  id                  uuid primary key default gen_random_uuid(),
  tool_id             text not null,
  marketplace         text not null,
  keyword             text not null,
  search_count        integer not null default 0,
  first_searched_at   timestamptz not null default now(),
  last_searched_at    timestamptz not null default now(),
  unique (tool_id, marketplace, keyword)
);

create index if not exists keyword_search_stats_priority_idx
  on public.keyword_search_stats (tool_id, marketplace, search_count desc, last_searched_at desc);

alter table public.keyword_search_stats enable row level security;
-- No public policies — only the service role (API route + cron) touches this table.

-- Atomic "seen this search again" increment, callable via RPC from the
-- service-role client so concurrent guest requests never lose a count to a
-- read-then-write race.
create or replace function public.record_keyword_search(
  p_tool_id text,
  p_marketplace text,
  p_keyword text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.keyword_search_stats (tool_id, marketplace, keyword, search_count, first_searched_at, last_searched_at)
  values (p_tool_id, p_marketplace, p_keyword, 1, now(), now())
  on conflict (tool_id, marketplace, keyword)
  do update set
    search_count = public.keyword_search_stats.search_count + 1,
    last_searched_at = now();
$$;

grant execute on function public.record_keyword_search(text, text, text) to anon, authenticated, service_role;
