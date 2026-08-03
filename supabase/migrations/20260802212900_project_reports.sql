-- Project progress reports (weekly/monthly digests for clients)

create type public.report_period as enum ('week', 'month', 'custom');

create table public.project_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  period public.report_period not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  title text not null,
  narrative text,
  digest jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_to text[] not null default '{}'::text[]
);

create index project_reports_project_id_created_at_idx
  on public.project_reports (project_id, created_at desc);

create trigger project_reports_set_updated_at
  before update on public.project_reports
  for each row execute function public.set_updated_at();

alter table public.project_reports enable row level security;

create policy "Members can view project reports"
  on public.project_reports for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

create policy "Admins can create project reports"
  on public.project_reports for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_platform_admin()
      or public.is_project_admin(project_id)
    )
  );

create policy "Admins can update project reports"
  on public.project_reports for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can delete project reports"
  on public.project_reports for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

grant select, insert, update, delete on public.project_reports to authenticated;
