-- ─────────────────────────────────────────────────────────────────────────────
-- 0012 — user_transactions: locale + packaging columns; marketplace_credentials: country_code
--
-- Adds the forward-compatible locale fields (currency, country_code) the domain
-- model already carries in memory (Transaction.currency, Aşama A design), plus
-- the physical `packaging` column behind the packaging cost added in code, and
-- `desi` (Turkish volumetric-weight unit) for later shipping models.
--
-- Defaults keep every EXISTING row valid and unchanged in meaning:
--   currency     → 'TRY'   (the only real-money channel today)
--   country_code → 'TR'
--   desi         → 0
--   packaging    → 0        (matches the code's "missing packaging == 0" rule)
--
-- Safe to re-run: every statement is additive / IF NOT EXISTS style.
--
-- STATUS: written, NOT YET APPLIED to production — apply only after explicit
-- approval (remote history verified at 0001–0011 via `supabase migration list`).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_transactions
  add column if not exists currency text not null default 'TRY';

alter table public.user_transactions
  add column if not exists country_code text not null default 'TR';

alter table public.user_transactions
  add column if not exists desi numeric not null default 0;

alter table public.user_transactions
  add column if not exists packaging numeric not null default 0;

alter table public.marketplace_credentials
  add column if not exists country_code text not null default 'TR';
