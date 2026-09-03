-- Days a project is typically worked on (0 = Sunday … 6 = Saturday, matching JS Date.getDay()).

alter table public.projects
  add column if not exists scheduled_weekdays smallint[] not null default '{}'::smallint[];

alter table public.projects
  drop constraint if exists projects_scheduled_weekdays_valid;

alter table public.projects
  add constraint projects_scheduled_weekdays_valid
  check (scheduled_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

comment on column public.projects.scheduled_weekdays is
  'Weekdays this project is scheduled to be worked on. 0 = Sunday through 6 = Saturday.';
