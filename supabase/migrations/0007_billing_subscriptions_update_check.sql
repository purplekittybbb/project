-- ─────────────────────────────────────────────────────────────────────────────
-- billing_subscriptions — close a missing WITH CHECK on UPDATE
--
-- 0005_billing_subscriptions.sql's "update own billing" policy only had a
-- USING clause (auth.uid() = user_id), which restricts which ROW a caller can
-- touch but not what the UPDATE is allowed to change it TO. Since user_id is
-- this table's primary key, a signed-in attacker could run:
--
--   update billing_subscriptions set user_id = '<victim-uuid>' where user_id = auth.uid()
--
-- This only succeeds against a row the attacker already owns (their own), but
-- if the victim has no billing_subscriptions row yet, it reassigns the
-- attacker's row (their real Stripe customer/subscription id, trial dates,
-- etc.) onto the victim's id — the victim's own SELECT (auth.uid() = user_id,
-- unaffected by this bug) would then read the ATTACKER's billing state as
-- their own. Adding a WITH CHECK identical to the USING clause closes this:
-- the new row image must ALSO satisfy auth.uid() = user_id, so user_id can
-- never be changed away from the caller's own id.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "update own billing" on public.billing_subscriptions;
create policy "update own billing"
  on public.billing_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
