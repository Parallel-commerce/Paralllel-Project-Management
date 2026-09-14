-- Optional classification for tasks, independent of workflow status.
-- Null means the type has not been selected.

create type public.task_type as enum (
  'bug',
  'new_feature',
  'improvement',
  'data',
  'documentation',
  'design',
  'research',
  'maintenance',
  'other'
);

alter table public.tasks
  add column task_type public.task_type;

create index tasks_task_type_idx on public.tasks (task_type);
