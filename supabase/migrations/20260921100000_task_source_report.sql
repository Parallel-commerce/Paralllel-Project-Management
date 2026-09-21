-- Link a task to the store-report recommendation it was created from.

alter table public.tasks
  add column if not exists source_report_id uuid references public.project_reports (id) on delete set null,
  add column if not exists source_action_key text;

alter table public.tasks
  drop constraint if exists tasks_source_action_key_format;

alter table public.tasks
  add constraint tasks_source_action_key_format
  check (
    source_action_key is null
    or source_action_key ~ '^[0-9a-f]{8,16}$'
  );

comment on column public.tasks.source_report_id is
  'Project report this task was created from, when turned from a Section 8 recommendation.';
comment on column public.tasks.source_action_key is
  'Stable hash of the report recommendation so the same action is not created twice.';

create unique index if not exists tasks_source_report_action_uidx
  on public.tasks (source_report_id, source_action_key)
  where source_report_id is not null and source_action_key is not null;

create index if not exists tasks_source_report_id_idx
  on public.tasks (source_report_id)
  where source_report_id is not null;
