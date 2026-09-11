-- 0023 — iyzico_subscriptions: idempotency + grace period + billing issue flag
--
-- Three additions to the iyzico_subscriptions table:
--
-- 1. UNIQUE on iyzico_payment_token — prevents duplicate subscription records
--    when iyzico re-sends the same callback (idempotency). NULL is excluded so
--    manual/admin rows without a token are still allowed.
--
-- 2. grace_period_end — timestamp after which past_due access is fully cut.
--    Set by the renewal-failure handler. NULL = no grace period active.
--    Example: if renewal fails today, grace_period_end = today + 3 days.
--    The grace period length is runtime-configurable (BILLING_GRACE_PERIOD_DAYS
--    env var, default 3) — not hard-coded here.
--
-- 3. billing_issue_at — timestamp when a billing problem was first detected
--    (renewal failed, card declined, etc.). NULL = no billing issue.
--    The dashboard reads this to show "ödemeniz alınamadı" UI banner.
--
-- STATUS: NOT YET APPLIED — show to user before applying.

alter table public.iyzico_subscriptions
  add column if not exists grace_period_end timestamptz,
  add column if not exists billing_issue_at timestamptz;

-- Unique constraint on payment token (partial: excludes NULL values)
create unique index if not exists iyzico_subscriptions_payment_token_uniq
  on public.iyzico_subscriptions(iyzico_payment_token)
  where iyzico_payment_token is not null;
