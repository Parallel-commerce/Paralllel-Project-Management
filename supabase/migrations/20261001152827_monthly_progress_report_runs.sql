-- Distinguish store reports from monthly performance reports in the same run log.

alter table public.weekly_store_report_runs
  add column if not exists report_kind text not null default 'store';

alter table public.weekly_store_report_runs
  drop constraint if exists weekly_store_report_runs_report_kind_check;

alter table public.weekly_store_report_runs
  add constraint weekly_store_report_runs_report_kind_check
    check (report_kind in ('store', 'progress'));

alter table public.weekly_store_report_runs
  drop constraint if exists weekly_store_report_runs_project_period_key;

alter table public.weekly_store_report_runs
  drop constraint if exists weekly_store_report_runs_project_period_kind_key;

alter table public.weekly_store_report_runs
  add constraint weekly_store_report_runs_project_period_kind_key
    unique (project_id, period, report_kind, week_start);

comment on column public.weekly_store_report_runs.report_kind is
  'store = Shopify store report; progress = monthly performance letter.';
