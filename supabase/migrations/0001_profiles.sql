-- profiles: one row per authenticated user, scoped by RLS to that user.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hospital text,
  specialty text,
  pgy integer,
  nickname text,
  training_start date,
  training_end date,
  xp integer not null default 0,
  mascot_level integer not null default 1,
  mascot_stage integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
