-- ─────────────────────────────────────────────────────────────────────────────
-- extension_tokens
--
-- Personal access tokens for the TrueMargin Chrome uzantısı ("Hesabı Bağla").
-- The extension popup cannot share the site's httpOnly session cookie (it runs
-- in a chrome-extension:// origin), so it authenticates instead with a long-
-- lived opaque token the user generates from the dashboard and pastes into the
-- extension once.
--
-- SECURITY: only a SHA-256 hash of the token is stored — never the raw value.
-- The raw token is shown to the user exactly once, at generation time
-- (app/api/account/extension-token/route.ts, POST). A user has at most one
-- active token; generating a new one revokes the previous one.
--
-- The lookup endpoint the extension calls (app/api/extension/lookup/route.ts)
-- authenticates by hashing the incoming Bearer token and matching token_hash
-- with the SERVICE ROLE client (this table's own RLS would otherwise block an
-- anonymous request from ever finding the matching row — the token IS the
-- credential here, same as any API-key pattern). Every other table it reads
-- afterwards is still explicitly scoped with `.eq("user_id", userId)`.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) once.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.extension_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  token_hash    text not null unique,
  label         text not null default 'Chrome Uzantısı',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists extension_tokens_user_id_idx on public.extension_tokens (user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Dashboard reads/writes go through the user's own session (auth.uid()).
-- The extension's own lookup call goes through the SERVICE ROLE client and so
-- bypasses RLS entirely by design (see note above) — these policies only
-- govern the dashboard's "Uzantı" settings panel.
alter table public.extension_tokens enable row level security;

drop policy if exists "select own extension tokens" on public.extension_tokens;
create policy "select own extension tokens"
  on public.extension_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own extension tokens" on public.extension_tokens;
create policy "insert own extension tokens"
  on public.extension_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete own extension tokens" on public.extension_tokens;
create policy "delete own extension tokens"
  on public.extension_tokens
  for delete
  using (auth.uid() = user_id);
