-- Client-safe reports, activity visibility, task links/attachments, restrict project create

-- 1) Reports: clients only see sent reports
drop policy if exists "Members can view project reports" on public.project_reports;
create policy "Members can view project reports"
  on public.project_reports for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      public.is_project_member(project_id)
      and (
        public.project_role(project_id) <> 'client'
        or sent_at is not null
      )
    )
  );

-- 2) Activity: mark what clients may see
alter table public.activity_events
  add column if not exists client_visible boolean not null default false;

drop policy if exists "Members can view project activity" on public.activity_events;
create policy "Members can view project activity"
  on public.activity_events for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      public.is_project_member(project_id)
      and (
        public.project_role(project_id) <> 'client'
        or client_visible = true
      )
    )
  );

create or replace function public.log_activity(
  p_project_id uuid,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb,
  p_client_visible boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not (
    public.is_platform_admin()
    or public.is_project_member(p_project_id)
    or p_actor_id = auth.uid()
  ) then
    raise exception 'Not allowed to log activity for this project';
  end if;

  insert into public.activity_events (
    project_id, actor_id, entity_type, entity_id, action, summary, metadata, client_visible
  )
  values (
    p_project_id,
    p_actor_id,
    p_entity_type,
    p_entity_id,
    p_action,
    p_summary,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_client_visible, false)
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.log_activity(uuid, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.log_activity(uuid, uuid, text, uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.log_activity(uuid, uuid, text, uuid, text, text, jsonb, boolean) to authenticated;

-- 3) Restrict project creation to platform admins or internal team (admin/member)
drop policy if exists "Authenticated users can create projects" on public.projects;
create policy "Internal users can create projects"
  on public.projects for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_platform_admin()
      or exists (
        select 1
        from public.project_members pm
        where pm.user_id = auth.uid()
          and pm.role in ('admin', 'member')
      )
    )
  );

-- 4) Task link + attachments
alter table public.tasks
  add column if not exists link_url text;

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  content_type text,
  size_bytes integer,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_id_idx
  on public.task_attachments (task_id);

alter table public.task_attachments enable row level security;

drop policy if exists "Users can view attachments on accessible tasks" on public.task_attachments;
create policy "Users can view attachments on accessible tasks"
  on public.task_attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.can_view_list(t.list_id)
    )
  );

drop policy if exists "Users can upload attachments on accessible tasks" on public.task_attachments;
create policy "Users can upload attachments on accessible tasks"
  on public.task_attachments for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.can_view_list(t.list_id)
    )
  );

drop policy if exists "Users can delete own or admin attachments" on public.task_attachments;
create policy "Users can delete own or admin attachments"
  on public.task_attachments for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.tasks t
      join public.lists l on l.id = t.list_id
      where t.id = task_id
        and public.is_project_admin(l.project_id)
    )
  );

grant select, insert, delete on public.task_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  true,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {project_id}/{task_id}/{filename}
drop policy if exists "Members can view task attachments" on storage.objects;
create policy "Members can view task attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members can upload task attachments" on storage.objects;
create policy "Members can upload task attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members can update task attachments" on storage.objects;
create policy "Members can update task attachments"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'task-attachments'
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members can delete task attachments" on storage.objects;
create policy "Members can delete task attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (
      public.is_project_admin(((storage.foldername(name))[1])::uuid)
      or owner = auth.uid()
    )
  );
