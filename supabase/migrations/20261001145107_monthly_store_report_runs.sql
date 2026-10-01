-- The same run log covers Monday weekly reports and 1st-of-month reports.

alter table public.weekly_store_report_runs
  add column if not exists period text not null default 'week';

alter table public.weekly_store_report_runs
  drop constraint if exists weekly_store_report_runs_period_check;

alter table public.weekly_store_report_runs
  add constraint weekly_store_report_runs_period_check
    check (period in ('week', 'month'));

alter table public.weekly_store_report_runs
  drop constraint if exists weekly_store_report_runs_project_week_key;

alter table public.weekly_store_report_runs
  drop constraint if exists weekly_store_report_runs_project_period_key;

alter table public.weekly_store_report_runs
  add constraint weekly_store_report_runs_project_period_key
    unique (project_id, period, week_start);

comment on table public.weekly_store_report_runs is
  'One row per store per reporting period. week = Monday 07:00 job; month = 1st of the month 07:00 job.';

comment on column public.weekly_store_report_runs.period is
  'week or month. week_start and week_end are the bounds of that period.';
