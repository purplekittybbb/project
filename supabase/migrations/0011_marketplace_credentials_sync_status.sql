-- ─────────────────────────────────────────────────────────────────────────────
-- marketplace_credentials — sync status columns
--
-- last_synced_at / last_sync_error / needs_reauth let the app (and the user)
-- see whether background cron / manual Refresh / webhooks actually succeeded,
-- instead of only knowing that credentials were stored once at connect time.
--
-- needs_reauth = true when the vendor rejected stored credentials (401/403)
-- — UI should prompt reconnect, not keep retrying silently forever.
--
-- Safe to re-run: every statement is additive / IF NOT EXISTS style.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketplace_credentials
  add column if not exists last_synced_at timestamptz;

alter table public.marketplace_credentials
  add column if not exists last_sync_error text;

alter table public.marketplace_credentials
  add column if not exists needs_reauth boolean not null default false;
