-- Provider-complete synchronization controls.
--
-- Raw endpoints and credentials remain in integration_credentials, which has
-- no anon/authenticated grants. User-facing connection/source metadata stays
-- readable through the existing owner RLS policies.

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in (
    'google', 'microsoft', 'todoist', 'apple', 'android', 'ics', 'caldav'
  ));

alter table public.integration_connections
  add column if not exists sync_mode text not null default 'two_way',
  add column if not exists auto_sync_enabled boolean not null default true,
  add column if not exists provider_config jsonb not null default '{}'::jsonb,
  add column if not exists sync_locked_until timestamptz,
  add column if not exists last_sync_started_at timestamptz;

alter table public.integration_connections
  drop constraint if exists integration_connections_sync_mode_check;
alter table public.integration_connections
  add constraint integration_connections_sync_mode_check
  check (sync_mode in ('read_only', 'two_way'));

alter table public.integration_credentials
  add column if not exists endpoint_url text,
  add column if not exists username text;

alter table public.integration_oauth_states
  drop constraint if exists integration_oauth_states_provider_check;
alter table public.integration_oauth_states
  add constraint integration_oauth_states_provider_check
  check (provider in ('google', 'microsoft', 'todoist'));

alter table public.integration_sources
  drop constraint if exists integration_sources_provider_check;
alter table public.integration_sources
  add constraint integration_sources_provider_check
  check (provider in (
    'google', 'microsoft', 'todoist', 'apple', 'android', 'ics', 'caldav'
  ));

alter table public.integration_sources
  add column if not exists sync_mode text not null default 'two_way';
alter table public.integration_sources
  drop constraint if exists integration_sources_sync_mode_check;
alter table public.integration_sources
  add constraint integration_sources_sync_mode_check
  check (sync_mode in ('read_only', 'two_way'));

alter table public.events
  drop constraint if exists events_source_provider_check;
alter table public.events
  add constraint events_source_provider_check
  check (source_provider is null or source_provider in (
    'google', 'microsoft', 'todoist', 'apple', 'android', 'ics', 'caldav'
  ));

alter table public.todos
  drop constraint if exists todos_source_provider_check;
alter table public.todos
  add constraint todos_source_provider_check
  check (source_provider is null or source_provider in (
    'google', 'microsoft', 'todoist', 'apple', 'android', 'ics', 'caldav'
  ));

-- Prevent concurrent manual/automatic syncs from racing on the same account.
create or replace function public.begin_integration_sync(
  p_connection_id uuid,
  p_user_id uuid,
  p_lock_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.integration_connections
  set sync_locked_until = now() + make_interval(secs => greatest(30, least(p_lock_seconds, 600))),
      last_sync_started_at = now()
  where id = p_connection_id
    and user_id = p_user_id
    and status in ('active', 'error')
    and (sync_locked_until is null or sync_locked_until < now());
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.finish_integration_sync(
  p_connection_id uuid,
  p_user_id uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.integration_connections
  set sync_locked_until = null,
      last_synced_at = case when p_error is null then now() else last_synced_at end,
      status = case when p_error is null then 'active' else 'error' end,
      last_error = p_error
  where id = p_connection_id and user_id = p_user_id;
end;
$$;

revoke all on function public.begin_integration_sync(uuid, uuid, integer) from public;
revoke all on function public.finish_integration_sync(uuid, uuid, text) from public;
grant execute on function public.begin_integration_sync(uuid, uuid, integer) to service_role;
grant execute on function public.finish_integration_sync(uuid, uuid, text) to service_role;
