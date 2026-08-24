-- Time entries require a task (NOT NULL). The original FK used ON DELETE SET NULL,
-- which fails with: null value in column "task_id" of relation "time_entries"
-- violates not-null constraint. Cascade so deleting a task removes its time entries,
-- matching comments and attachments.

alter table public.time_entries
  drop constraint time_entries_task_id_fkey;

alter table public.time_entries
  add constraint time_entries_task_id_fkey
  foreign key (task_id) references public.tasks (id) on delete cascade;
