-- Flat task comments (phase 2)

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  body text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_comments_body_not_blank check (char_length(trim(body)) > 0)
);

create index task_comments_task_id_idx on public.task_comments (task_id);
create index task_comments_created_at_idx on public.task_comments (created_at);

create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_updated_at();

alter table public.task_comments enable row level security;

create policy "Users can view comments on accessible tasks"
  on public.task_comments for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_comments.task_id
        and public.can_view_list(t.list_id)
    )
  );

create policy "Users can create comments on accessible tasks"
  on public.task_comments for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.tasks t
      where t.id = task_comments.task_id
        and public.can_view_list(t.list_id)
    )
  );

create policy "Authors can update own comments"
  on public.task_comments for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Authors and project admins can delete comments"
  on public.task_comments for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.tasks t
      join public.lists l on l.id = t.list_id
      where t.id = task_comments.task_id
        and (
          public.is_project_admin(l.project_id)
          or public.is_platform_admin()
        )
    )
  );

grant select, insert, update, delete on public.task_comments to authenticated;
