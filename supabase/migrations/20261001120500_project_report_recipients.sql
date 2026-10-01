-- Standing report recipients. These addresses receive every project report
-- and do not need a Parallel account. Clients cannot read this list.

create table public.project_report_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  email text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint project_report_recipients_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade,
  constraint project_report_recipients_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete restrict,
  constraint project_report_recipients_project_email_key unique (project_id, email),
  constraint project_report_recipients_email_format check (
    char_length(email) between 3 and 320
    and email = lower(email)
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

comment on table public.project_report_recipients is
  'Emails that always receive project reports. Admins only. No Parallel account required.';

create index project_report_recipients_created_by_idx
  on public.project_report_recipients (created_by);

alter table public.project_report_recipients enable row level security;

create policy "Admins can view report recipients"
  on public.project_report_recipients for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can add report recipients"
  on public.project_report_recipients for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.is_platform_admin()
      or public.is_project_admin(project_id)
    )
  );

create policy "Admins can remove report recipients"
  on public.project_report_recipients for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

revoke all on public.project_report_recipients from anon, public;
grant select, insert, delete on public.project_report_recipients to authenticated;
