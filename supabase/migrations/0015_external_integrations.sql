-- Unified external calendar/task integrations.
--
-- Provider credentials are deliberately separated from user-readable
-- connection metadata. Only Edge Functions using the service role may read
-- integration_credentials and integration_oauth_states.

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  account_email text,
  account_label text,
  status text not null default 'active',
  scopes text[] not null default '{}'::text[],
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_provider_check
    check (provider in ('google', 'microsoft', 'apple', 'android', 'ics', 'caldav')),
  constraint integration_connections_status_check
    check (status in ('active', 'expired', 'error', 'disabled')),
  unique (user_id, provider, provider_account_id)
);

create table if not exists public.integration_credentials (
  connection_id uuid primary key
    references public.integration_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  code_verifier text,
  return_to text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  constraint integration_oauth_states_provider_check
    check (provider in ('google', 'microsoft'))
);

create table if not exists public.integration_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete cascade,
  provider text not null,
  resource_type text not null,
  external_id text not null,
  name text not null,
  color text,
  selected boolean not null default false,
  is_default boolean not null default false,
  can_write boolean not null default true,
  sync_token text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_sources_provider_check
    check (provider in ('google', 'microsoft', 'apple', 'android', 'ics', 'caldav')),
  constraint integration_sources_resource_type_check
    check (resource_type in ('calendar', 'task_list')),
  unique (user_id, provider, resource_type, external_id)
);

create index if not exists integration_connections_user_provider_idx
  on public.integration_connections (user_id, provider);
create index if not exists integration_sources_user_provider_idx
  on public.integration_sources (user_id, provider, resource_type);
create index if not exists integration_oauth_states_expiry_idx
  on public.integration_oauth_states (expires_at);

alter table public.integration_connections enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.integration_oauth_states enable row level security;
alter table public.integration_sources enable row level security;

drop policy if exists "integration_connections_select_own" on public.integration_connections;
create policy "integration_connections_select_own" on public.integration_connections
  for select using (auth.uid() = user_id);

drop policy if exists "integration_connections_delete_own" on public.integration_connections;
create policy "integration_connections_delete_own" on public.integration_connections
  for delete using (auth.uid() = user_id);

drop policy if exists "integration_sources_all_own" on public.integration_sources;
create policy "integration_sources_all_own" on public.integration_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Explicitly keep raw OAuth material unavailable through the public API.
revoke all on public.integration_credentials from anon, authenticated;
revoke all on public.integration_oauth_states from anon, authenticated;

alter table public.events
  add column if not exists source_provider text,
  add column if not exists external_id text,
  add column if not exists external_source_id text,
  add column if not exists external_etag text,
  add column if not exists external_url text,
  add column if not exists external_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_status text not null default 'pending',
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.todos
  add column if not exists source_provider text,
  add column if not exists external_id text,
  add column if not exists external_source_id text,
  add column if not exists external_etag text,
  add column if not exists external_url text,
  add column if not exists external_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_status text not null default 'pending',
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.events
  drop constraint if exists events_source_provider_check;
alter table public.events
  add constraint events_source_provider_check
  check (source_provider is null or source_provider in (
    'google', 'microsoft', 'apple', 'android', 'ics', 'caldav'
  ));
alter table public.events
  drop constraint if exists events_sync_status_check;
alter table public.events
  add constraint events_sync_status_check
  check (sync_status in ('pending', 'synced', 'error'));

alter table public.todos
  drop constraint if exists todos_source_provider_check;
alter table public.todos
  add constraint todos_source_provider_check
  check (source_provider is null or source_provider in (
    'google', 'microsoft', 'apple', 'android', 'ics', 'caldav'
  ));
alter table public.todos
  drop constraint if exists todos_sync_status_check;
alter table public.todos
  add constraint todos_sync_status_check
  check (sync_status in ('pending', 'synced', 'error'));

create unique index if not exists events_external_identity_idx
  on public.events (user_id, source_provider, external_source_id, external_id);
create unique index if not exists todos_external_identity_idx
  on public.todos (user_id, source_provider, external_source_id, external_id);
create index if not exists events_pending_sync_idx
  on public.events (user_id, source_provider, sync_status)
  where sync_status <> 'synced';
create index if not exists todos_pending_sync_idx
  on public.todos (user_id, source_provider, sync_status)
  where sync_status <> 'synced';

-- Preserve the former Google push mappings as first-class external identities.
update public.events
set source_provider = 'google',
    external_source_id = 'primary',
    external_id = gcal_id,
    sync_status = 'synced',
    last_synced_at = coalesce(last_synced_at, now())
where gcal_id is not null and external_id is null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists integration_connections_touch_updated_at
  on public.integration_connections;
create trigger integration_connections_touch_updated_at
before update on public.integration_connections
for each row execute function public.touch_updated_at();

drop trigger if exists integration_sources_touch_updated_at
  on public.integration_sources;
create trigger integration_sources_touch_updated_at
before update on public.integration_sources
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists todos_touch_updated_at on public.todos;
create trigger todos_touch_updated_at
before update on public.todos
for each row execute function public.touch_updated_at();

-- 0013 intentionally narrowed todo column grants to keep xp_granted
-- server-owned. Extend only the non-XP integration columns.
grant insert (
  user_id, title, done, due_date, priority, due_time, created_at,
  source_provider, external_id, external_source_id, external_etag,
  external_url, external_updated_at, last_synced_at, sync_status,
  deleted_at, updated_at
) on public.todos to authenticated;
grant update (
  title, done, due_date, priority, due_time,
  source_provider, external_id, external_source_id, external_etag,
  external_url, external_updated_at, last_synced_at, sync_status,
  deleted_at, updated_at
) on public.todos to authenticated;

-- Completing an externally-backed task makes it pending for the provider
-- while preserving the server-authoritative XP behavior.
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
  where id = p_todo_id and user_id = uid and deleted_at is null for update;
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

  update public.todos set
    done = p_done,
    xp_granted = todo.xp_granted,
    sync_status = case
      when source_provider is not null then 'pending'
      else sync_status
    end
  where id = todo.id returning * into todo;
  return jsonb_build_object(
    'todo', to_jsonb(todo),
    'profile', to_jsonb(current_profile),
    'xp_granted_now', inserted_id is not null
  );
end;
$$;

revoke all on function public.set_todo_done_with_xp(uuid, boolean) from public;
grant execute on function public.set_todo_done_with_xp(uuid, boolean) to authenticated;
