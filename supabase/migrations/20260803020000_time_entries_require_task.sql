-- Require time entries to belong to a task (task-level tracking)

delete from public.time_entries
where task_id is null;

alter table public.time_entries
  alter column task_id set not null;

create index if not exists time_entries_task_id_started_at_idx
  on public.time_entries (task_id, started_at desc);
