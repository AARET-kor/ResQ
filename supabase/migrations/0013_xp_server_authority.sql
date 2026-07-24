-- XP server authority: fixed rewards, verified source actions, and protected
-- profile/todo columns. Clients can no longer choose event type or amount.
alter table public.xp_events
  add column if not exists source_key text,
  add column if not exists server_verified boolean not null default false;

alter table public.xp_events
  drop constraint if exists xp_events_type_check;
alter table public.xp_events
  add constraint xp_events_type_check
  check (type in ('daily_login', 'read_paper', 'schedule_done', 'weekly_academic'))
  not valid;
alter table public.xp_events
  drop constraint if exists xp_events_amount_check;
alter table public.xp_events
  add constraint xp_events_amount_check
  check (
    (type = 'daily_login' and amount = 10)
    or (type = 'read_paper' and amount = 20)
    or (type = 'schedule_done' and amount = 8)
    or (type = 'weekly_academic' and amount = 30)
  )
  not valid;

-- Existing client-written rows remain as an explicitly unverified legacy
-- baseline. PostgreSQL still enforces NOT VALID checks for every new row.
comment on column public.xp_events.server_verified is
  'false for legacy client-written rows; true only for rewards verified by a server RPC';

create unique index if not exists xp_events_source_unique
  on public.xp_events (user_id, type, source_key)
  where source_key is not null;

drop policy if exists "xp_events_insert_own" on public.xp_events;
revoke insert, update, delete on public.xp_events from authenticated;

-- Column-level grants only work after removing the broader table grant.
revoke insert, update on public.profiles from authenticated;
grant insert (
  id, hospital, specialty, pgy, nickname, training_start, training_end,
  mascot_species, mascot_name, interests, ics_token,
  gmail_ai_consent_at, gmail_ai_consent_revoked_at, privacy_policy_version,
  created_at, updated_at
) on public.profiles to authenticated;
grant update (
  id, hospital, specialty, pgy, nickname, training_start, training_end,
  mascot_species, mascot_name, interests, ics_token,
  gmail_ai_consent_at, gmail_ai_consent_revoked_at, privacy_policy_version,
  updated_at
) on public.profiles to authenticated;

-- xp_granted is server-owned. Ordinary todo fields remain user-editable.
revoke insert, update on public.todos from authenticated;
grant insert (user_id, title, done, due_date, priority, due_time, created_at)
  on public.todos to authenticated;
grant update (title, done, due_date, priority, due_time)
  on public.todos to authenticated;

create or replace function public.grant_daily_login_xp()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  local_day date := (now() at time zone 'Asia/Seoul')::date;
  current_profile public.profiles%rowtype;
  previous_day date;
  inserted_id uuid;
  next_streak integer;
begin
  if uid is null then raise exception 'authentication required'; end if;
  select * into current_profile from public.profiles where id = uid for update;
  if not found then raise exception 'profile not found'; end if;

  insert into public.xp_events (user_id, type, amount, day, source_key, server_verified)
  values (uid, 'daily_login', 10, local_day, local_day::text, true)
  on conflict do nothing
  returning id into inserted_id;
  if inserted_id is null then return current_profile; end if;

  previous_day := current_profile.last_active_on;
  next_streak := case
    when previous_day = local_day - 1 then coalesce(current_profile.streak_days, 0) + 1
    else 1
  end;
  update public.profiles set
    xp = xp + 10,
    last_active_on = local_day,
    streak_days = next_streak,
    updated_at = now()
  where id = uid
  returning * into current_profile;
  return current_profile;
end;
$$;

create or replace function public.set_todo_done_with_xp(
  p_todo_id uuid,
  p_done boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  todo public.todos%rowtype;
  current_profile public.profiles%rowtype;
  inserted_id uuid;
begin
  if uid is null then raise exception 'authentication required'; end if;
  select * into todo from public.todos
  where id = p_todo_id and user_id = uid for update;
  if not found then raise exception 'todo not found'; end if;
  select * into current_profile from public.profiles where id = uid for update;
  if not found then raise exception 'profile not found'; end if;

  if p_done and not todo.xp_granted then
    insert into public.xp_events (user_id, type, amount, day, source_key, server_verified)
    values (
      uid, 'schedule_done', 8,
      (now() at time zone 'Asia/Seoul')::date,
      todo.id::text,
      true
    )
    on conflict do nothing
    returning id into inserted_id;
    if inserted_id is not null then
      update public.profiles set xp = xp + 8, updated_at = now()
      where id = uid returning * into current_profile;
    end if;
    todo.xp_granted := true;
  end if;

  update public.todos set done = p_done, xp_granted = todo.xp_granted
  where id = todo.id returning * into todo;
  return jsonb_build_object(
    'todo', to_jsonb(todo),
    'profile', to_jsonb(current_profile),
    'xp_granted_now', inserted_id is not null
  );
end;
$$;

create or replace function public.grant_paper_read_xp(p_pmid text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  local_day date := (now() at time zone 'Asia/Seoul')::date;
  current_profile public.profiles%rowtype;
  inserted_id uuid;
  grants_today integer;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if length(coalesce(p_pmid, '')) not between 1 and 100 then raise exception 'invalid paper id'; end if;
  select * into current_profile from public.profiles where id = uid for update;
  if not found then raise exception 'profile not found'; end if;
  if not exists (
    select 1 from public.paper_analyses
    where user_id = uid and pmid = p_pmid
  ) then raise exception 'saved analysis required'; end if;

  select count(*) into grants_today from public.xp_events
  where user_id = uid and type = 'read_paper' and day = local_day;
  if grants_today >= 5 then
    return current_profile;
  end if;

  insert into public.xp_events (user_id, type, amount, day, source_key, server_verified)
  values (uid, 'read_paper', 20, local_day, p_pmid, true)
  on conflict do nothing
  returning id into inserted_id;
  if inserted_id is not null then
    update public.profiles set xp = xp + 20, updated_at = now()
    where id = uid;
  end if;
  select * into current_profile from public.profiles where id = uid;
  return current_profile;
end;
$$;

revoke all on function public.grant_daily_login_xp() from public;
revoke all on function public.set_todo_done_with_xp(uuid, boolean) from public;
revoke all on function public.grant_paper_read_xp(text) from public;
grant execute on function public.grant_daily_login_xp() to authenticated;
grant execute on function public.set_todo_done_with_xp(uuid, boolean) to authenticated;
grant execute on function public.grant_paper_read_xp(text) to authenticated;
