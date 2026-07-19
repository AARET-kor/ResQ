-- Slice 7: todo priority + due time. Re-runnable.
alter table public.todos
  add column if not exists priority text not null default 'normal', -- high | normal | low
  add column if not exists due_time text;                            -- 'HH:mm' | null
