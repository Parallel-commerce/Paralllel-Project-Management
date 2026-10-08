-- Subtasks belong to a task. The earlier list-level table was unused.

drop table if exists public.list_subtasks;

create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  title text not null,
  description text,
  assigned_to uuid,
  due_date date,
  created_by uuid not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_subtasks_task_id_fkey
    foreign key (task_id) references public.tasks (id) on delete cascade,
  constraint task_subtasks_assigned_to_fkey
    foreign key (assigned_to) references public.profiles (id) on delete set null,
  constraint task_subtasks_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete restrict,
  constraint task_subtasks_title_len check (char_length(btrim(title)) between 1 and 300),
  constraint task_subtasks_description_len check (
    description is null or char_length(description) <= 8000
  )
);

comment on table public.task_subtasks is
  'Children of a task: title, description, assignee, and due date. There is no reporter.';

create index task_subtasks_task_id_idx
  on public.task_subtasks (task_id, completed_at, due_date);

create index task_subtasks_assignee_open_idx
  on public.task_subtasks (assigned_to, due_date)
  where completed_at is null;

create index task_subtasks_created_by_idx
  on public.task_subtasks (created_by);

create trigger task_subtasks_set_updated_at
  before update on public.task_subtasks
  for each row execute function public.set_updated_at();

alter table public.task_subtasks enable row level security;

create policy "Users can view subtasks on accessible tasks"
  on public.task_subtasks for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_subtasks.task_id
        and public.can_view_list(t.list_id)
    )
  );

create policy "Users can create subtasks on accessible tasks"
  on public.task_subtasks for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_view_list(t.list_id)
    )
    and (
      assigned_to is null
      or exists (
        select 1
        from public.tasks t
        join public.project_members pm
          on pm.project_id = t.project_id
         and pm.user_id = assigned_to
        where t.id = task_id
      )
    )
  );

create policy "Users can update subtasks on accessible tasks"
  on public.task_subtasks for update
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_subtasks.task_id
        and public.can_view_list(t.list_id)
    )
  )
  with check (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_view_list(t.list_id)
    )
    and (
      assigned_to is null
      or exists (
        select 1
        from public.tasks t
        join public.project_members pm
          on pm.project_id = t.project_id
         and pm.user_id = assigned_to
        where t.id = task_id
      )
    )
  );

create policy "Creators and admins can delete subtasks"
  on public.task_subtasks for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.is_platform_admin())
    or exists (
      select 1
      from public.tasks t
      where t.id = task_subtasks.task_id
        and public.is_project_admin(t.project_id)
    )
  );

grant select, insert, update, delete on public.task_subtasks to authenticated;
