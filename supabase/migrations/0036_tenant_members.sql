-- ─────────────────────────────────────────────────────────────────────────────
-- tenant_members
--
-- Ekip/rol bazlı çoklu kullanıcı erişimi ("team/role-based multi-user
-- access") — an account owner invites a teammate by email; once the invited
-- person signs up/logs in and accepts, they get READ-ONLY access to the
-- owner's data. Only one role exists today ("viewer") — this is deliberately
-- narrow rather than a full permissions system, since the product's data is
-- financial and a first version should not attempt fine-grained write roles.
--
-- IMPORTANT — how access actually works: this table does NOT grant broad
-- Postgres RLS access to every other table (user_transactions,
-- decision_ledger, credentials, etc. all stay scoped to auth.uid() = owner
-- only, unchanged). Instead, a member's read access is mediated entirely by
-- a service-role API route (app/api/team/data) that checks membership here
-- server-side before returning the owner's data. This is a deliberately
-- smaller blast radius than rewriting RLS across every existing table.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tenant_members (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users (id) on delete cascade,
  member_email   text not null,
  -- Filled in only once the invited person accepts (see app/api/team/accept).
  member_user_id uuid references auth.users (id) on delete cascade,
  role           text not null default 'viewer' check (role in ('viewer')),
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invite_token   uuid not null default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  unique (owner_user_id, member_email)
);

create index if not exists tenant_members_owner_idx on public.tenant_members (owner_user_id);
create index if not exists tenant_members_member_idx on public.tenant_members (member_user_id);
create index if not exists tenant_members_token_idx on public.tenant_members (invite_token);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Note: the invite/accept/data-read API routes all use the service-role
-- client (bypasses RLS, like every other cron/admin route in this project) —
-- these policies only govern what a signed-in user's OWN browser session can
-- see directly, as a defense-in-depth layer, not the primary access path.
alter table public.tenant_members enable row level security;

drop policy if exists "owner manages own invites" on public.tenant_members;
create policy "owner manages own invites"
  on public.tenant_members
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "member sees own membership" on public.tenant_members;
create policy "member sees own membership"
  on public.tenant_members
  for select
  using (auth.uid() = member_user_id);
