-- Add privacy-bounded planner extraction to the shared AI usage ledger and
-- duplicate-request lock. The Edge Function deliberately completes this
-- operation without a cached response so extracted clinical text is not
-- persisted in ai_request_cache.response.

alter table public.ai_request_cache
  drop constraint if exists ai_request_cache_operation_check;
alter table public.ai_request_cache
  add constraint ai_request_cache_operation_check
  check (operation in ('abstract', 'fulltext', 'pdf', 'planner_extract'));

alter table public.ai_usage_events
  drop constraint if exists ai_usage_operation_check;
alter table public.ai_usage_events
  add constraint ai_usage_operation_check
  check (operation in ('abstract', 'fulltext', 'pdf', 'planner_extract'));

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
  if p_operation not in ('abstract', 'fulltext', 'pdf', 'planner_extract') then
    raise exception 'invalid operation';
  end if;
  if p_input_bytes < 0 then raise exception 'invalid input size'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(uid::text || ':' || p_request_hash, 0)
  );

  select * into cached
  from public.ai_request_cache
  where user_id = uid and request_hash = p_request_hash;

  if found and cached.status = 'completed' and cached.response is not null then
    insert into public.ai_usage_events (
      user_id, request_hash, operation, status, input_bytes,
      input_tokens, output_tokens
    ) values (
      uid, p_request_hash, cached.operation, 'cache_hit', p_input_bytes,
      cached.input_tokens, cached.output_tokens
    );
    return query select false, 'completed'::text, cached.response;
    return;
  end if;

  -- Planner extraction responses may contain sensitive derived titles and are
  -- intentionally not cached. Still suppress an immediate repeat after a
  -- completed request so double clicks cannot create duplicate AI cost.
  if found
    and cached.operation = 'planner_extract'
    and cached.status = 'completed'
    and cached.updated_at > now() - interval '2 minutes' then
    insert into public.ai_usage_events (
      user_id, request_hash, operation, status, input_bytes,
      input_tokens, output_tokens
    ) values (
      uid, p_request_hash, cached.operation, 'duplicate', p_input_bytes,
      cached.input_tokens, cached.output_tokens
    );
    return query select false, 'completed'::text, null::text;
    return;
  end if;

  if found and cached.status = 'pending'
    and cached.updated_at > now() - interval '10 minutes' then
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

revoke all on function public.claim_ai_request(text, text, integer) from public;
grant execute on function public.claim_ai_request(text, text, integer) to authenticated;
