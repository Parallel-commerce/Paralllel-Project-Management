-- Per-customer choice for scheduled store reports.

alter table public.projects
  add column if not exists auto_weekly_report boolean not null default true,
  add column if not exists auto_monthly_report boolean not null default true;

comment on column public.projects.auto_weekly_report is
  'When true, prepare a weekly store report every Monday.';

comment on column public.projects.auto_monthly_report is
  'When true, prepare a monthly store report and performance letter on the 1st.';
