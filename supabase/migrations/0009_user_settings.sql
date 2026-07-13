-- ─────────────────────────────────────────────────────────────────────────────
-- user_settings
--
-- One row per signed-in user for account-level preferences that aren't
-- financial data — starting with UI/Copilot language. Same RLS pattern as
-- every other per-user table in this project (user_transactions,
-- decision_ledger, copilot_messages): auth.uid() = user_id, enforced by
-- Postgres, not the client.
--
-- language_preference drives BOTH the UI's i18n language (lib/i18n) and the
-- language the Copilot (Gemini) is instructed to answer in — see
-- app/api/chat/route.ts's callGemini(). Defaults to 'en': this is a
-- US-focused product, so a brand-new user (no row here yet) is English until
-- they explicitly switch in Settings.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_settings (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  language_preference  text not null default 'en' check (language_preference in ('en', 'tr')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.user_settings enable row level security;

drop policy if exists "select own settings" on public.user_settings;
create policy "select own settings"
  on public.user_settings
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own settings" on public.user_settings;
create policy "insert own settings"
  on public.user_settings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own settings" on public.user_settings;
create policy "update own settings"
  on public.user_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
