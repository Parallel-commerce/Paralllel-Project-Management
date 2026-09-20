-- Distinguish activity progress reports from weekly Shopify store reports.

create type public.report_kind as enum ('progress', 'store');

alter table public.project_reports
  add column kind public.report_kind not null default 'progress';

comment on column public.project_reports.kind is
  'progress = project activity digest; store = weekly Shopify performance report.';
