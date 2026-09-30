-- Growth plan, schedule cadence (weekly/fortnightly), and task importance.

alter type public.project_type add value if not exists 'growth';

create type public.schedule_cadence as enum ('weekly', 'fortnightly');

alter table public.project_engagement
  add column if not exists schedule_cadence public.schedule_cadence not null default 'weekly',
  add column if not exists schedule_anchor_date date not null default (current_date);

comment on column public.project_engagement.schedule_cadence is
  'How often scheduled weekdays are available: every week, or every other week from the anchor date.';

comment on column public.project_engagement.schedule_anchor_date is
  'Reference date for fortnightly cadence. Work weeks align to this date''s ISO week.';

alter table public.tasks
  add column if not exists importance integer not null default 0;

alter table public.tasks
  drop constraint if exists tasks_importance_range;

alter table public.tasks
  add constraint tasks_importance_range check (importance >= 0 and importance <= 100);

comment on column public.tasks.importance is
  'Higher = more important. Todo lists sort by this descending before due date.';

create index if not exists tasks_project_importance_idx
  on public.tasks (project_id, importance desc, due_date asc nulls last)
  where archived_at is null;
