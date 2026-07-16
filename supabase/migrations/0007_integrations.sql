-- Slice 6: external calendar integrations. Re-runnable.
alter table public.events
  add column if not exists gcal_id text;
alter table public.profiles
  add column if not exists ics_token uuid not null default gen_random_uuid();
