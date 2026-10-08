-- Lightweight items on a list: title, description, assignee, and due date.
-- They are not full tasks, so they have no reporter, type, or schedule slot.

create table public.list_subtasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  title text not null,
  description text,
  assigned_to uuid,
  due_date date,
  created_by uuid not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_subtasks_list_id_fkey
    foreign key (list_id) references public.lists (id) on delete cascade,
  constraint list_subtasks_assigned_to_fkey
    foreign key (assigned_to) references public.profiles (id) on delete set null,
  constraint list_subtasks_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete restrict,
  constraint list_subtasks_title_len check (char_length(btrim(title)) between 1 and 300),
  constraint list_subtasks_description_len check (
    description is null or char_length(description) <= 8000
  )
);

comment on table public.list_subtasks is
  'Smaller items on a list. Assignee is optional. There is no reporter.';

create index list_subtasks_list_id_idx
  on public.list_subtasks (list_id, completed_at, due_date);

create index list_subtasks_assignee_open_idx
  on public.list_subtasks (assigned_to, due_date)
  where completed_at is null;

create index list_subtasks_created_by_idx
  on public.list_subtasks (created_by);

create trigger list_subtasks_set_updated_at
  before update on public.list_subtasks
  for each row execute function public.set_updated_at();

alter table public.list_subtasks enable row level security;

create policy "Users can view subtasks on accessible lists"
  on public.list_subtasks for select
  to authenticated
  using (public.can_view_list(list_id));

create policy "Users can create subtasks on accessible lists"
  on public.list_subtasks for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_view_list(list_id)
    and (
      assigned_to is null
      or exists (
        select 1
        from public.lists l
        join public.project_members pm
          on pm.project_id = l.project_id
         and pm.user_id = assigned_to
        where l.id = list_id
      )
    )
  );

create policy "Users can update subtasks on accessible lists"
  on public.list_subtasks for update
  to authenticated
  using (public.can_view_list(list_id))
  with check (
    public.can_view_list(list_id)
    and (
      assigned_to is null
      or exists (
        select 1
        from public.lists l
        join public.project_members pm
          on pm.project_id = l.project_id
         and pm.user_id = assigned_to
        where l.id = list_id
      )
    )
  );

create policy "Creators and admins can delete subtasks"
  on public.list_subtasks for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.is_platform_admin())
    or exists (
      select 1
      from public.lists l
      where l.id = list_subtasks.list_id
        and public.is_project_admin(l.project_id)
    )
  );

grant select, insert, update, delete on public.list_subtasks to authenticated;
