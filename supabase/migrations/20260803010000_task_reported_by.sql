-- Who raised the task (may differ from created_by / assigned_to)

alter table public.tasks
  add column if not exists reported_by uuid references public.profiles (id) on delete set null;

update public.tasks
set reported_by = created_by
where reported_by is null;

alter table public.tasks
  alter column reported_by set not null;

create index if not exists tasks_reported_by_idx
  on public.tasks (reported_by);
