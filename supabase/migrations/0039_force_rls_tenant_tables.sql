-- ─────────────────────────────────────────────────────────────────────────────
-- 0039 — FORCE ROW LEVEL SECURITY on tenant-owned tables (ücretsiz Faz 1)
--
-- ENABLE ROW LEVEL SECURITY alone does not apply policies to the table owner
-- / bypass roles in all contexts. FORCE ROW LEVEL SECURITY makes policies
-- apply even to the table owner (service_role still bypasses RLS by design).
--
-- Additive / idempotent. No paid infra. Apply in Supabase SQL editor when ready
-- (after 0038). Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'user_transactions',
    'marketplace_credentials',
    'decision_ledger',
    'billing_subscriptions',
    'copilot_messages',
    'user_settings',
    'loss_alarms',
    'product_costs',
    'profit_calc_history',
    'visibility_checks',
    'demand_estimates',
    'iyzico_subscriptions',
    'canonical_products',
    'visibility_watches',
    'extension_tokens',
    'settlement_payouts',
    'tenant_members'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);
    end if;
  end loop;
end $$;
