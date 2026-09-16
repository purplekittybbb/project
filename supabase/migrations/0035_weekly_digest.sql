-- ─────────────────────────────────────────────────────────────────────────────
-- weekly_digest_enabled — opt-in weekly profit-summary email.
--
-- Adds one column to the existing user_settings table (0009). Defaults to
-- false: nobody receives an email they didn't explicitly ask for. Toggled
-- from the dashboard's Settings tab; read by app/api/cron/weekly-digest.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once —
-- after 0009_user_settings.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_settings
  add column if not exists weekly_digest_enabled boolean not null default false;
