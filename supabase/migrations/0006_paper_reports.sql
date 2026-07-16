-- Papers v2: analyses become a report library. Re-runnable.
alter table public.paper_analyses
  add column if not exists kind text not null default 'abstract',      -- abstract | report
  add column if not exists has_fulltext boolean not null default false,
  add column if not exists source text;                                 -- journal label | 'pdf'
