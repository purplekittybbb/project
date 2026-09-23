-- Hardening: billing_subscriptions writes must go through service-role API routes.
-- Authenticated clients keep SELECT only — prevents self-granting trialing/active.

drop policy if exists "insert own billing" on public.billing_subscriptions;
drop policy if exists "update own billing" on public.billing_subscriptions;

-- Keep select own billing (from 0005). Re-assert for clarity.
drop policy if exists "select own billing" on public.billing_subscriptions;
create policy "select own billing"
  on public.billing_subscriptions
  for select
  using (auth.uid() = user_id);

-- Constrain status values used by Stripe / demo trial paths.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_status_check;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_status_check
  check (
    status in (
      'pending',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'cancelled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused'
    )
  );
