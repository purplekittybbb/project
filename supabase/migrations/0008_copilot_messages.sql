-- ─────────────────────────────────────────────────────────────────────────────
-- copilot_messages
--
-- Persists the signed-in user's Analyst Copilot conversation so it survives a
-- page reload or a fresh sign-in on another device — until now every message
-- lived only in React state and vanished on refresh. Append-only (no
-- update/delete policy): a transcript, not an editable document. RLS follows
-- the exact same auth.uid() = user_id pattern as every other per-user table
-- in this project (user_transactions, decision_ledger, marketplace_credentials).
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.copilot_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- Which path produced an assistant reply ('model' | 'rule-based' | 'model-error');
  -- null for the user's own messages. Purely informational — never used for access control.
  mode       text,
  created_at timestamptz not null default now()
);

create index if not exists copilot_messages_user_created_idx
  on public.copilot_messages (user_id, created_at);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.copilot_messages enable row level security;

drop policy if exists "select own copilot messages" on public.copilot_messages;
create policy "select own copilot messages"
  on public.copilot_messages
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own copilot messages" on public.copilot_messages;
create policy "insert own copilot messages"
  on public.copilot_messages
  for insert
  with check (auth.uid() = user_id);

-- Deliberately no update/delete policy — a transcript is append-only, and (as
-- with decision_ledger) Postgres denies those statements outright for every
-- role, including the row's own owner, when RLS is enabled with no matching
-- policy.
