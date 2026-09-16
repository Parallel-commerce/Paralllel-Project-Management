-- Internal-only service type and monthly hours. Clients cannot read these rows.

create type public.project_type as enum (
  'new_website',
  'maintain',
  'optimise',
  'accelerate',
  'enterprise_b2b'
);

create table public.project_engagement (
  project_id uuid primary key references public.projects (id) on delete cascade,
  project_type public.project_type,
  monthly_hours integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_engagement_monthly_hours_nonneg
    check (monthly_hours is null or monthly_hours >= 0)
);

comment on table public.project_engagement is
  'Service type and monthly hours for a project. Visible to Parallel staff only, not clients.';

comment on column public.project_engagement.monthly_hours is
  'Retainer hours the client gets per month.';

create trigger project_engagement_set_updated_at
  before update on public.project_engagement
  for each row execute function public.set_updated_at();

alter table public.project_engagement enable row level security;

create policy "Internal team and CRM can view project engagement"
  on public.project_engagement for select
  to authenticated
  using (
    public.is_project_internal(project_id)
    or (select public.is_crm_user())
  );

create policy "Admins can insert project engagement"
  on public.project_engagement for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can update project engagement"
  on public.project_engagement for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

grant select, insert, update on public.project_engagement to authenticated;
