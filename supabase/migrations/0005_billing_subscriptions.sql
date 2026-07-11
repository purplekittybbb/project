create table if not exists public.billing_subscriptions (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id      text not null,
  stripe_subscription_id  text,
  status                  text not null default 'pending',
  trial_end               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (stripe_customer_id);

alter table public.billing_subscriptions enable row level security;

drop policy if exists "select own billing" on public.billing_subscriptions;
create policy "select own billing"
  on public.billing_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own billing" on public.billing_subscriptions;
create policy "insert own billing"
  on public.billing_subscriptions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own billing" on public.billing_subscriptions;
create policy "update own billing"
  on public.billing_subscriptions
  for update
  using (auth.uid() = user_id);
