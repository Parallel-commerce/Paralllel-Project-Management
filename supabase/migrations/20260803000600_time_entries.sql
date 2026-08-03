-- Internal-only project time tracking (admins + members; clients excluded)

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  description text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  source text not null check (source in ('timer', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_ended_after_start check (
    ended_at is null or ended_at >= started_at
  ),
  constraint time_entries_duration_nonneg check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint time_entries_timer_or_manual check (
    (source = 'timer' and (ended_at is null or duration_seconds is not null))
    or (source = 'manual' and ended_at is not null and duration_seconds is not null)
  )
);

create index time_entries_project_id_started_at_idx
  on public.time_entries (project_id, started_at desc);

create index time_entries_user_id_started_at_idx
  on public.time_entries (user_id, started_at desc);

-- One running timer per user across the app
create unique index time_entries_one_running_timer_per_user_idx
  on public.time_entries (user_id)
  where ended_at is null;

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

create or replace function public.is_project_internal(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'member')
    );
$$;

revoke all on function public.is_project_internal(uuid) from public, anon;
grant execute on function public.is_project_internal(uuid) to authenticated;

alter table public.time_entries enable row level security;

create policy "Internal team can view project time entries"
  on public.time_entries for select
  to authenticated
  using (public.is_project_internal(project_id));

create policy "Internal team can create own time entries"
  on public.time_entries for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_project_internal(project_id)
  );

create policy "Users can update own time entries"
  on public.time_entries for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_project_internal(project_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_project_internal(project_id)
  );

create policy "Admins can update project time entries"
  on public.time_entries for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Users can delete own time entries"
  on public.time_entries for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_project_internal(project_id)
  );

create policy "Admins can delete project time entries"
  on public.time_entries for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

grant select, insert, update, delete on public.time_entries to authenticated;
