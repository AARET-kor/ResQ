-- Mascot: extend profiles + an XP ledger. Re-runnable (idempotent).
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
  day date not null,            -- the user's LOCAL calendar day (client-supplied)
  created_at timestamptz not null default now()
);

create index if not exists xp_events_user_created_idx
  on public.xp_events (user_id, created_at);

-- Enforce at most one daily_login per user per local day. `day` is the client's
-- local date (not created_at::date) so KST early-morning logins aren't wrongly
-- rejected by a UTC boundary. Makes daily-login idempotent even under a race /
-- React StrictMode double-invoke — the second insert is rejected, not double-granted.
create unique index if not exists xp_events_daily_login_unique
  on public.xp_events (user_id, day) where type = 'daily_login';

alter table public.xp_events enable row level security;

drop policy if exists "xp_events_select_own" on public.xp_events;
drop policy if exists "xp_events_insert_own" on public.xp_events;

create policy "xp_events_select_own" on public.xp_events
  for select using (auth.uid() = user_id);
create policy "xp_events_insert_own" on public.xp_events
  for insert with check (auth.uid() = user_id);
