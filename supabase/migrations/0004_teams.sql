-- Slice 4: shared team task board. Re-runnable.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'resident', -- resident | professor
  nickname text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  status text not null default 'todo', -- todo | doing | done
  assignee text,
  due_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_tasks_team_idx on public.team_tasks (team_id, created_at);

-- security definer membership check — avoids RLS self-recursion on team_members.
create or replace function public.is_team_member(tid uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = tid and user_id = auth.uid()
  );
$$;

-- join by invite code without a readable teams row; returns the team id.
create or replace function public.join_team_by_code(invite_code text, member_nickname text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare tid uuid;
begin
  select id into tid from public.teams where code = invite_code;
  if tid is null then
    raise exception 'invalid code';
  end if;
  insert into public.team_members (team_id, user_id, nickname)
  values (tid, auth.uid(), member_nickname)
  on conflict (team_id, user_id) do nothing;
  return tid;
end;
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_tasks enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member" on public.teams
  for select using (public.is_team_member(id));
drop policy if exists "teams_insert_own" on public.teams;
create policy "teams_insert_own" on public.teams
  for insert with check (auth.uid() = created_by);

drop policy if exists "team_members_select_member" on public.team_members;
create policy "team_members_select_member" on public.team_members
  for select using (public.is_team_member(team_id));
drop policy if exists "team_members_insert_self" on public.team_members;
create policy "team_members_insert_self" on public.team_members
  for insert with check (auth.uid() = user_id);
drop policy if exists "team_members_delete_self" on public.team_members;
create policy "team_members_delete_self" on public.team_members
  for delete using (auth.uid() = user_id);

drop policy if exists "team_tasks_all_member" on public.team_tasks;
create policy "team_tasks_all_member" on public.team_tasks
  for all using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
