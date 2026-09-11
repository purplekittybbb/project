-- 0021 — iyzico_subscriptions
-- STATUS: NOT YET APPLIED — apply only after approval.
-- NOTE: If billing_subscriptions already exists from a previous Stripe attempt,
-- this migration adds iyzico-specific columns (iyzico_payment_token, etc.)
-- without dropping the table. Stripe columns are left in place but unused.
-- The existing billing_subscriptions table (0005) has stripe_* columns;
-- this migration creates a SEPARATE iyzico_subscriptions table so there is
-- no conflict and both schemas can coexist until Stripe is fully removed.

create table if not exists public.iyzico_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  plan_id                 text not null check (plan_id in ('starter', 'pro')),
  status                  text not null check (status in ('active', 'cancelled', 'past_due', 'trialing')),
  iyzico_payment_token    text,   -- token from iyzico checkout form result
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancelled_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.iyzico_subscriptions enable row level security;

create policy "select own subscriptions"
  on public.iyzico_subscriptions for select using (auth.uid() = user_id);

create policy "insert own subscriptions"
  on public.iyzico_subscriptions for insert with check (auth.uid() = user_id);

create policy "update own subscriptions"
  on public.iyzico_subscriptions for update using (auth.uid() = user_id);
