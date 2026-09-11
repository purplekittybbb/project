-- 0028 — guest_tool_usage
-- Daily counters for standalone (Category 1) public tools.
-- IP hash for guests; user_id for signed-in users without store requirement.

create table if not exists public.guest_tool_usage (
  id            uuid primary key default gen_random_uuid(),
  day           date not null default (timezone('utc', now()))::date,
  tool_id       text not null,
  subject_key   text not null,
  subject_type  text not null check (subject_type in ('ip', 'user')),
  usage_count   integer not null default 0 check (usage_count >= 0),
  updated_at    timestamptz not null default now(),
  unique (day, tool_id, subject_key, subject_type)
);

create index if not exists guest_tool_usage_lookup_idx
  on public.guest_tool_usage (day, tool_id, subject_key, subject_type);

alter table public.guest_tool_usage enable row level security;

-- No public policies — only service role writes/reads from API routes.
