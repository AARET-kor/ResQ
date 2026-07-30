-- Slice 5: cached AI analyses of papers. Re-runnable.
create table if not exists public.paper_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pmid text not null,
  title text not null,
  journal text,
  year text,
  abstract text,
  analysis text not null,
  created_at timestamptz not null default now(),
  unique (user_id, pmid)
);
create index if not exists paper_analyses_user_idx on public.paper_analyses (user_id, created_at);

alter table public.paper_analyses enable row level security;

drop policy if exists "paper_analyses_all_own" on public.paper_analyses;
create policy "paper_analyses_all_own" on public.paper_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
