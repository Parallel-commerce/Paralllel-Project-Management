-- Restore task link_url so currently deployed queries keep working.
-- The column was dropped before production stopped selecting it.

alter table public.tasks
  add column if not exists link_url text;
