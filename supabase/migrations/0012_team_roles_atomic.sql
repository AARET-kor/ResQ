-- Team authorization v2: atomic creation, canonical assignees, soft delete,
-- role-aware member management, and an immutable audit trail.
update public.team_members member
set role = case
  when member.user_id = team.created_by then 'owner'
  when member.role = 'professor' then 'professor'
  else 'member'
end
from public.teams team
where team.id = member.team_id;

-- Repair any orphan team left by the former two-request creation flow.
insert into public.team_members (team_id, user_id, role, nickname)
select team.id, team.created_by, 'owner', profile.nickname
from public.teams team
left join public.team_members member
  on member.team_id = team.id and member.user_id = team.created_by
left join public.profiles profile on profile.id = team.created_by
where member.user_id is null
on conflict (team_id, user_id) do update set role = 'owner';

alter table public.team_members
  drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check
  check (role in ('owner', 'admin', 'professor', 'member'));

comment on column public.team_members.role is
  'owner: roles/ownership/all deletes; admin: non-admin member management/all task deletes; professor/member: collaborative task access without administrative authority';

create unique index if not exists team_members_one_owner_idx
  on public.team_members (team_id) where role = 'owner';

alter table public.team_tasks
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

update public.team_tasks task
set assignee_user_id = (
  select member.user_id
  from public.team_members member
  where member.team_id = task.team_id
    and member.nickname = task.assignee
  order by member.joined_at
  limit 1
)
where task.assignee_user_id is null and task.assignee is not null;

alter table public.team_tasks
  drop constraint if exists team_tasks_status_check;
alter table public.team_tasks
  add constraint team_tasks_status_check check (status in ('todo', 'doing', 'done'));

create table if not exists public.team_audit_events (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  task_id uuid,
  target_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint team_audit_action_check check (action in (
    'team_created', 'member_joined', 'member_left', 'member_removed',
    'role_changed', 'ownership_transferred',
    'task_created', 'task_status_changed', 'task_deleted'
  ))
);

create index if not exists team_audit_team_created_idx
  on public.team_audit_events (team_id, created_at desc);

alter table public.team_audit_events enable row level security;

create or replace function public.team_role(tid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.team_members
  where team_id = tid and user_id = auth.uid();
$$;

create or replace function public.is_team_admin(tid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.team_role(tid) in ('owner', 'admin'), false);
$$;

-- Replace permissive direct-write policies. All team mutations below go
-- through audited security-definer RPCs.
drop policy if exists "teams_insert_own" on public.teams;
drop policy if exists "team_members_insert_self" on public.team_members;
drop policy if exists "team_members_delete_self" on public.team_members;
drop policy if exists "team_tasks_all_member" on public.team_tasks;

drop policy if exists "team_tasks_select_member" on public.team_tasks;
create policy "team_tasks_select_member" on public.team_tasks
  for select using (public.is_team_member(team_id) and deleted_at is null);

drop policy if exists "team_audit_select_member" on public.team_audit_events;
create policy "team_audit_select_member" on public.team_audit_events
  for select using (public.is_team_member(team_id));

create or replace function public.create_team_atomic(
  team_name text,
  creator_nickname text
)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  invite_code text;
  created_team public.teams%rowtype;
  attempt integer;
  i integer;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(team_name, ''))) not between 1 and 80 then raise exception 'invalid team name'; end if;
  if length(coalesce(creator_nickname, '')) > 80 then raise exception 'invalid nickname'; end if;

  for attempt in 1..10 loop
    -- gen_random_uuid() is available in supported Supabase Postgres versions
    -- without relying on the pgcrypto extension's installation schema.
    random_bytes := uuid_send(gen_random_uuid());
    invite_code := '';
    for i in 0..5 loop
      invite_code := invite_code || substr(chars, (get_byte(random_bytes, i) % length(chars)) + 1, 1);
    end loop;
    begin
      insert into public.teams (name, code, created_by)
      values (trim(team_name), invite_code, uid)
      returning * into created_team;
      exit;
    exception when unique_violation then
      if attempt = 10 then raise exception 'could not allocate invite code'; end if;
    end;
  end loop;

  insert into public.team_members (team_id, user_id, role, nickname)
  values (created_team.id, uid, 'owner', nullif(trim(creator_nickname), ''));
  insert into public.team_audit_events (team_id, actor_user_id, action)
  values (created_team.id, uid, 'team_created');
  return created_team;
end;
$$;

create or replace function public.join_team_by_code(invite_code text, member_nickname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if length(coalesce(member_nickname, '')) > 80 then raise exception 'invalid nickname'; end if;
  select id into tid from public.teams where code = upper(trim(invite_code));
  if tid is null then raise exception 'invalid code'; end if;

  insert into public.team_members (team_id, user_id, role, nickname)
  values (tid, uid, 'member', nullif(trim(member_nickname), ''))
  on conflict (team_id, user_id) do nothing;
  if found then
    insert into public.team_audit_events (team_id, actor_user_id, action, target_user_id)
    values (tid, uid, 'member_joined', uid);
  end if;
  return tid;
end;
$$;

create or replace function public.add_team_task(
  p_team_id uuid,
  p_title text,
  p_assignee_user_id uuid default null
)
returns public.team_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  assignee_id uuid := coalesce(p_assignee_user_id, auth.uid());
  assignee_name text;
  created_task public.team_tasks%rowtype;
begin
  if not public.is_team_member(p_team_id) then raise exception 'not a team member'; end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 300 then raise exception 'invalid task title'; end if;
  select nickname into assignee_name from public.team_members
  where team_id = p_team_id and user_id = assignee_id;
  if not found then raise exception 'assignee is not a team member'; end if;

  insert into public.team_tasks (
    team_id, title, created_by, assignee_user_id, assignee
  ) values (
    p_team_id, trim(p_title), uid, assignee_id, assignee_name
  ) returning * into created_task;
  insert into public.team_audit_events (team_id, actor_user_id, action, task_id)
  values (p_team_id, uid, 'task_created', created_task.id);
  return created_task;
end;
$$;

create or replace function public.set_team_task_status(
  p_task_id uuid,
  p_status text
)
returns public.team_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  previous_status text;
  updated_task public.team_tasks%rowtype;
begin
  if p_status not in ('todo', 'doing', 'done') then raise exception 'invalid status'; end if;
  select status into previous_status from public.team_tasks
  where id = p_task_id and deleted_at is null
    and public.is_team_member(team_id)
  for update;
  if not found then raise exception 'task not found'; end if;

  update public.team_tasks set status = p_status
  where id = p_task_id returning * into updated_task;
  insert into public.team_audit_events (team_id, actor_user_id, action, task_id, metadata)
  values (
    updated_task.team_id, uid, 'task_status_changed', updated_task.id,
    jsonb_build_object('from', previous_status, 'to', p_status)
  );
  return updated_task;
end;
$$;

create or replace function public.soft_delete_team_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  task public.team_tasks%rowtype;
begin
  select * into task from public.team_tasks
  where id = p_task_id and deleted_at is null for update;
  if not found then return; end if;
  if task.created_by <> uid and not public.is_team_admin(task.team_id) then
    raise exception 'only the task creator or an admin can delete';
  end if;
  update public.team_tasks set deleted_at = now(), deleted_by = uid where id = p_task_id;
  insert into public.team_audit_events (team_id, actor_user_id, action, task_id)
  values (task.team_id, uid, 'task_deleted', task.id);
end;
$$;

create or replace function public.set_team_member_role(
  p_team_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_role text;
begin
  if public.team_role(p_team_id) <> 'owner' then raise exception 'owner required'; end if;
  if p_role not in ('admin', 'professor', 'member') then raise exception 'invalid role'; end if;
  select role into old_role from public.team_members
  where team_id = p_team_id and user_id = p_user_id for update;
  if not found or old_role = 'owner' then raise exception 'invalid target'; end if;
  update public.team_members set role = p_role
  where team_id = p_team_id and user_id = p_user_id;
  insert into public.team_audit_events (team_id, actor_user_id, action, target_user_id, metadata)
  values (
    p_team_id, auth.uid(), 'role_changed', p_user_id,
    jsonb_build_object('from', old_role, 'to', p_role)
  );
end;
$$;

create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.team_role(p_team_id);
  target_role text;
begin
  if actor_role not in ('owner', 'admin') then raise exception 'admin required'; end if;
  select role into target_role from public.team_members
  where team_id = p_team_id and user_id = p_user_id for update;
  if not found or target_role = 'owner' then raise exception 'cannot remove owner'; end if;
  if actor_role = 'admin' and target_role = 'admin' then raise exception 'owner required'; end if;

  update public.team_tasks
  set assignee_user_id = null, assignee = null
  where team_id = p_team_id and assignee_user_id = p_user_id;
  delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
  insert into public.team_audit_events (team_id, actor_user_id, action, target_user_id)
  values (p_team_id, auth.uid(), 'member_removed', p_user_id);
end;
$$;

create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor_role text := public.team_role(p_team_id);
begin
  if actor_role is null then return; end if;
  if actor_role = 'owner' then raise exception 'transfer ownership before leaving'; end if;
  update public.team_tasks
  set assignee_user_id = null, assignee = null
  where team_id = p_team_id and assignee_user_id = auth.uid();
  delete from public.team_members where team_id = p_team_id and user_id = auth.uid();
  insert into public.team_audit_events (team_id, actor_user_id, action, target_user_id)
  values (p_team_id, auth.uid(), 'member_left', auth.uid());
end;
$$;

create or replace function public.transfer_team_ownership(p_team_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_role text;
begin
  if public.team_role(p_team_id) <> 'owner' then raise exception 'owner required'; end if;
  select role into target_role from public.team_members
  where team_id = p_team_id and user_id = p_new_owner_id for update;
  if not found or p_new_owner_id = auth.uid() then raise exception 'invalid new owner'; end if;

  update public.team_members set role = 'admin'
  where team_id = p_team_id and user_id = auth.uid();
  update public.team_members set role = 'owner'
  where team_id = p_team_id and user_id = p_new_owner_id;
  insert into public.team_audit_events (team_id, actor_user_id, action, target_user_id, metadata)
  values (
    p_team_id, auth.uid(), 'ownership_transferred', p_new_owner_id,
    jsonb_build_object('previous_role', target_role)
  );
end;
$$;

revoke all on function public.create_team_atomic(text, text) from public;
revoke all on function public.join_team_by_code(text, text) from public;
revoke all on function public.add_team_task(uuid, text, uuid) from public;
revoke all on function public.set_team_task_status(uuid, text) from public;
revoke all on function public.soft_delete_team_task(uuid) from public;
revoke all on function public.set_team_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_team_member(uuid, uuid) from public;
revoke all on function public.leave_team(uuid) from public;
revoke all on function public.transfer_team_ownership(uuid, uuid) from public;
grant execute on function public.create_team_atomic(text, text) to authenticated;
grant execute on function public.join_team_by_code(text, text) to authenticated;
grant execute on function public.add_team_task(uuid, text, uuid) to authenticated;
grant execute on function public.set_team_task_status(uuid, text) to authenticated;
grant execute on function public.soft_delete_team_task(uuid) to authenticated;
grant execute on function public.set_team_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.transfer_team_ownership(uuid, uuid) to authenticated;
