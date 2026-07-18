-- Papers v3: multi-specialty interests. Re-runnable.
alter table public.profiles
  add column if not exists interests text; -- comma-separated specialty names
