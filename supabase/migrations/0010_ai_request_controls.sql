-- AI request controls: per-user idempotency cache and append-only usage ledger.
create table if not exists public.ai_request_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  operation text not null,
  status text not null default 'pending',
  response text,
  input_bytes integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_hash),
  constraint ai_request_cache_operation_check
    check (operation in ('abstract', 'fulltext', 'pdf')),
  constraint ai_request_cache_status_check
    check (status in ('pending', 'completed', 'failed')),
  constraint ai_request_cache_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_request_cache_input_bytes_check
    check (input_bytes >= 0)
);

create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  operation text not null,
  status text not null,
  input_bytes integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_usage_operation_check
    check (operation in ('abstract', 'fulltext', 'pdf')),
  constraint ai_usage_status_check
    check (status in ('completed', 'failed', 'cache_hit', 'duplicate')),
  constraint ai_usage_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists ai_usage_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_request_cache enable row level security;
alter table public.ai_usage_events enable row level security;

drop policy if exists "ai_request_cache_select_own" on public.ai_request_cache;
create policy "ai_request_cache_select_own" on public.ai_request_cache
  for select using (auth.uid() = user_id);

drop policy if exists "ai_usage_select_own" on public.ai_usage_events;
create policy "ai_usage_select_own" on public.ai_usage_events
  for select using (auth.uid() = user_id);

-- Atomically claim an analysis hash. The advisory lock closes the race where
-- two first-time requests both observe a missing cache row.
create or replace function public.claim_ai_request(
  p_request_hash text,
  p_operation text,
  p_input_bytes integer
)
returns table (
  claimed boolean,
  cache_status text,
  cached_response text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cached public.ai_request_cache%rowtype;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_request_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid request hash'; end if;
  if p_operation not in ('abstract', 'fulltext', 'pdf') then raise exception 'invalid operation'; end if;
  if p_input_bytes < 0 then raise exception 'invalid input size'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_request_hash, 0));

  select * into cached
  from public.ai_request_cache
  where user_id = uid and request_hash = p_request_hash;

  if found and cached.status = 'completed' and cached.response is not null then
    insert into public.ai_usage_events (
      user_id, request_hash, operation, status, input_bytes, input_tokens, output_tokens
    ) values (
      uid, p_request_hash, cached.operation, 'cache_hit', p_input_bytes,
      cached.input_tokens, cached.output_tokens
    );
    return query select false, 'completed'::text, cached.response;
    return;
  end if;

  if found and cached.status = 'pending'
    and cached.updated_at > now() - interval '2 minutes' then
    insert into public.ai_usage_events (
      user_id, request_hash, operation, status, input_bytes
    ) values (
      uid, p_request_hash, cached.operation, 'duplicate', p_input_bytes
    );
    return query select false, 'pending'::text, null::text;
    return;
  end if;

  insert into public.ai_request_cache (
    user_id, request_hash, operation, status, response, input_bytes, updated_at
  ) values (
    uid, p_request_hash, p_operation, 'pending', null, p_input_bytes, now()
  )
  on conflict (user_id, request_hash) do update set
    operation = excluded.operation,
    status = 'pending',
    response = null,
    input_bytes = excluded.input_bytes,
    input_tokens = null,
    output_tokens = null,
    updated_at = now();

  return query select true, 'pending'::text, null::text;
end;
$$;

create or replace function public.complete_ai_request(
  p_request_hash text,
  p_status text,
  p_response text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cached public.ai_request_cache%rowtype;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_status not in ('completed', 'failed') then raise exception 'invalid completion status'; end if;

  select * into cached
  from public.ai_request_cache
  where user_id = uid and request_hash = p_request_hash
  for update;
  if not found then raise exception 'request claim not found'; end if;

  update public.ai_request_cache set
    status = p_status,
    response = case when p_status = 'completed' then p_response else null end,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    updated_at = now()
  where user_id = uid and request_hash = p_request_hash;

  insert into public.ai_usage_events (
    user_id, request_hash, operation, status, input_bytes,
    input_tokens, output_tokens, error_code
  ) values (
    uid, p_request_hash, cached.operation, p_status, cached.input_bytes,
    p_input_tokens, p_output_tokens, left(p_error_code, 80)
  );
end;
$$;

revoke all on function public.claim_ai_request(text, text, integer) from public;
revoke all on function public.complete_ai_request(text, text, text, integer, integer, text) from public;
grant execute on function public.claim_ai_request(text, text, integer) to authenticated;
grant execute on function public.complete_ai_request(text, text, text, integer, integer, text) to authenticated;
