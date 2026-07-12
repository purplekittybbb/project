-- ─────────────────────────────────────────────────────────────────────────────
-- record_decision_if_changed
--
-- app/api/ledger/record used to do "select last row, compare in JS, insert if
-- different" as two separate round-trips. Two concurrent calls for the same
-- user (e.g. React Strict Mode's double-invoked mount effect, or a resync
-- overlapping the initial load) can both read the same "last row" before
-- either has inserted, both conclude the decision "changed", and both insert
-- — producing duplicate ledger rows with the same timestamp. Confirmed live:
-- a fresh signed-in test account ended up with two identical decision_ledger
-- rows recorded in the same second.
--
-- Moving the read-compare-insert into one plpgsql function, serialized by a
-- per-user advisory transaction lock, makes it atomic: the second concurrent
-- caller blocks until the first commits, then re-reads and correctly sees no
-- change.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.record_decision_if_changed(
  p_tenant_id text,
  p_approved_limit numeric,
  p_take_rate numeric,
  p_currency text,
  p_model_version text
) returns boolean
language plpgsql
security invoker
as $$
declare
  v_last record;
  v_inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'record_decision_if_changed requires an authenticated user';
  end if;

  -- Serialize concurrent calls for this one user only; released automatically
  -- at the end of this function's implicit transaction.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select approved_limit, take_rate, currency
    into v_last
    from public.decision_ledger
    where user_id = auth.uid()
    order by recorded_at desc
    limit 1;

  if v_last is null
     or v_last.approved_limit is distinct from p_approved_limit
     or v_last.take_rate is distinct from p_take_rate
     or v_last.currency is distinct from p_currency
  then
    insert into public.decision_ledger (user_id, tenant_id, approved_limit, take_rate, currency, model_version)
    values (auth.uid(), p_tenant_id, p_approved_limit, p_take_rate, p_currency, p_model_version);
    v_inserted := true;
  end if;

  return v_inserted;
end;
$$;

grant execute on function public.record_decision_if_changed(text, numeric, numeric, text, text) to authenticated;
