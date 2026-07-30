-- Explicit Gmail AI consent and metadata-only processing audit.
alter table public.profiles
  add column if not exists gmail_ai_consent_at timestamptz,
  add column if not exists gmail_ai_consent_revoked_at timestamptz,
  add column if not exists privacy_policy_version text;

create table if not exists public.gmail_ai_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started',
  email_count integer not null,
  masked_char_count integer not null,
  candidates_count integer,
  request_hash text,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '1 year'),
  constraint gmail_audit_status_check check (status in ('started', 'completed', 'failed')),
  constraint gmail_audit_counts_check check (
    email_count between 0 and 8
    and masked_char_count between 0 and 40000
    and (candidates_count is null or candidates_count >= 0)
  ),
  constraint gmail_audit_hash_check check (
    request_hash is null or request_hash ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists gmail_audit_user_created_idx
  on public.gmail_ai_audit_events (user_id, created_at desc);

alter table public.gmail_ai_audit_events enable row level security;

drop policy if exists "gmail_audit_select_own" on public.gmail_ai_audit_events;
create policy "gmail_audit_select_own" on public.gmail_ai_audit_events
  for select using (auth.uid() = user_id);

create or replace function public.begin_gmail_ai_scan(
  p_email_count integer,
  p_masked_char_count integer,
  p_request_hash text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  audit_id bigint;
  consent_ok boolean;
begin
  if uid is null then return null; end if;
  if p_email_count < 0 or p_email_count > 8 then raise exception 'invalid email count'; end if;
  if p_masked_char_count < 0 or p_masked_char_count > 40000 then raise exception 'invalid character count'; end if;
  if p_request_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid request hash'; end if;

  select (
    gmail_ai_consent_at is not null
    and privacy_policy_version = '2026-07-24'
    and (
      gmail_ai_consent_revoked_at is null
      or gmail_ai_consent_at > gmail_ai_consent_revoked_at
    )
  ) into consent_ok
  from public.profiles
  where id = uid;

  if not coalesce(consent_ok, false) then return null; end if;

  -- Expired metadata is removed opportunistically; email content is never stored.
  delete from public.gmail_ai_audit_events where expires_at < now();

  insert into public.gmail_ai_audit_events (
    user_id, email_count, masked_char_count, request_hash
  ) values (
    uid, p_email_count, p_masked_char_count, p_request_hash
  ) returning id into audit_id;
  return audit_id;
end;
$$;

create or replace function public.complete_gmail_ai_scan(
  p_audit_id bigint,
  p_status text,
  p_candidates_count integer default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_status not in ('completed', 'failed') then raise exception 'invalid status'; end if;

  update public.gmail_ai_audit_events set
    status = p_status,
    candidates_count = p_candidates_count,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    error_code = left(p_error_code, 80),
    completed_at = now()
  where id = p_audit_id and user_id = auth.uid();

  if not found then raise exception 'audit event not found'; end if;
end;
$$;

create or replace function public.delete_my_gmail_audit_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.gmail_ai_audit_events where user_id = auth.uid();
$$;

revoke all on function public.begin_gmail_ai_scan(integer, integer, text) from public;
revoke all on function public.complete_gmail_ai_scan(bigint, text, integer, integer, integer, text) from public;
revoke all on function public.delete_my_gmail_audit_events() from public;
grant execute on function public.begin_gmail_ai_scan(integer, integer, text) to authenticated;
grant execute on function public.complete_gmail_ai_scan(bigint, text, integer, integer, integer, text) to authenticated;
grant execute on function public.delete_my_gmail_audit_events() to authenticated;
