-- Monday store reports are created by the scheduled job, which has no user.

alter table public.project_reports
  alter column created_by drop not null;

comment on column public.project_reports.created_by is
  'Profile that created the report. Null when the Monday scheduled job created it.';

create table if not exists public.weekly_store_report_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  report_id uuid references public.project_reports (id) on delete set null,
  status text not null,
  error text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_store_report_runs_status_check
    check (status in ('running', 'generated', 'skipped', 'failed')),
  constraint weekly_store_report_runs_attempts_check
    check (attempts between 1 and 5),
  constraint weekly_store_report_runs_project_week_key
    unique (project_id, week_start)
);

comment on table public.weekly_store_report_runs is
  'One row per store per reporting week for the Monday 07:00 job.';

create index if not exists weekly_store_report_runs_created_at_idx
  on public.weekly_store_report_runs (created_at desc);

create index if not exists weekly_store_report_runs_report_id_idx
  on public.weekly_store_report_runs (report_id);

drop trigger if exists weekly_store_report_runs_set_updated_at
  on public.weekly_store_report_runs;

create trigger weekly_store_report_runs_set_updated_at
  before update on public.weekly_store_report_runs
  for each row execute function public.set_updated_at();

alter table public.weekly_store_report_runs enable row level security;

drop policy if exists "Admins can view weekly store report runs"
  on public.weekly_store_report_runs;

create policy "Admins can view weekly store report runs"
  on public.weekly_store_report_runs for select
  to authenticated
  using (
    (select public.is_platform_admin())
    or public.is_project_admin(project_id)
  );

revoke all on public.weekly_store_report_runs from anon, public;
grant select on public.weekly_store_report_runs to authenticated;
