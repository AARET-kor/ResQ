-- Mascot: extend profiles + an XP ledger. Additive/idempotent.
alter table public.profiles
  add column if not exists mascot_species text,
  add column if not exists mascot_name text,
  add column if not exists last_active_on date,
  add column if not exists streak_days integer not null default 0;

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.xp_events enable row level security;

create policy "xp_events_select_own" on public.xp_events
  for select using (auth.uid() = user_id);
create policy "xp_events_insert_own" on public.xp_events
  for insert with check (auth.uid() = user_id);
