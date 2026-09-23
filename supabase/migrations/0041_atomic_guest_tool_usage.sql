-- Atomic guest tool quota increment (fixes read-then-write race under concurrent POSTs).
-- SECURITY DEFINER so API service-role can call; no public execute for anon/authenticated.

create or replace function public.increment_guest_tool_usage(
  p_day date,
  p_tool_id text,
  p_subject_key text,
  p_subject_type text,
  p_limit integer
)
returns table(allowed boolean, usage_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid limit';
  end if;

  -- Ensure row exists at 0 without racing increments.
  insert into public.guest_tool_usage (day, tool_id, subject_key, subject_type, usage_count, updated_at)
  values (p_day, p_tool_id, p_subject_key, p_subject_type, 0, now())
  on conflict (day, tool_id, subject_key, subject_type) do nothing;

  update public.guest_tool_usage g
  set
    usage_count = g.usage_count + 1,
    updated_at = now()
  where g.day = p_day
    and g.tool_id = p_tool_id
    and g.subject_key = p_subject_key
    and g.subject_type = p_subject_type
    and g.usage_count < p_limit
  returning g.usage_count into v_count;

  if found then
    return query select true, v_count;
    return;
  end if;

  select g.usage_count into v_count
  from public.guest_tool_usage g
  where g.day = p_day
    and g.tool_id = p_tool_id
    and g.subject_key = p_subject_key
    and g.subject_type = p_subject_type;

  return query select false, coalesce(v_count, p_limit);
end;
$$;

revoke all on function public.increment_guest_tool_usage(date, text, text, text, integer) from public;
revoke all on function public.increment_guest_tool_usage(date, text, text, text, integer) from anon, authenticated;
grant execute on function public.increment_guest_tool_usage(date, text, text, text, integer) to service_role;
