-- Slice 3: personal todos + schedule events. Re-runnable.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  xp_granted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos (user_id, created_at);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  kind text not null default 'other',
  location text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists events_user_starts_idx on public.events (user_id, starts_at);

alter table public.todos enable row level security;
alter table public.events enable row level security;

drop policy if exists "todos_all_own" on public.todos;
create policy "todos_all_own" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "events_all_own" on public.events;
create policy "events_all_own" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
