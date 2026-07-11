-- ─────────────────────────────────────────────────────────────────────────────
-- user_transactions — de-dupe safety net for automatic marketplace resync
--
-- lib/marketplace-resync.ts (used by the manual "Refresh" button, the
-- silent /connect auto-reconnect, AND the hourly cron in
-- app/api/cron/sync-marketplaces) already de-dupes at the APPLICATION layer
-- before every insert: it reads a user's existing order_ids for a
-- marketplace and only inserts orders not already present. That check alone
-- is sufficient for correctness under this app's actual call pattern
-- (sequential, one sync at a time per user+marketplace — see the cron
-- route's doc comment).
--
-- This index is a second, DB-enforced layer for the pathological case the
-- app-level check can't fully rule out on its own: two resyncs for the SAME
-- user+marketplace racing at the exact same moment (e.g. the hourly cron
-- firing at the same instant as a manual "Refresh" click) could both read
-- "no existing order X" before either has inserted it, and both insert it.
-- With this unique index in place, the second insert of that exact
-- (user_id, marketplace, order_id) simply fails instead of duplicating —
-- Postgres, not application timing, has the final word.
--
-- OPTIONAL: the app runs correctly today without this migration applied
-- (the de-dupe SELECT-then-filter in resyncMarketplace works regardless).
-- Apply this whenever convenient via the Supabase SQL editor or
-- `supabase db push` — nothing in the app depends on it being present yet.
--
-- Partial index: manual/CSV rows commonly default order_id to '' (see
-- 0001_user_transactions.sql) and many such rows legitimately share that
-- same empty value — only real marketplace order ids (non-empty) are
-- de-duplicated here.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists user_transactions_dedupe_idx
  on public.user_transactions (user_id, marketplace, order_id)
  where order_id <> '';
