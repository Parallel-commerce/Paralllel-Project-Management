-- Images attached to task comments, shown inline in the thread.
-- Empty comment bodies are allowed when the comment has attachments
-- (enforced in the application because attachments are inserted after the row).

alter table public.task_comments
  drop constraint if exists task_comments_body_not_blank;

create table public.task_comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.task_comments (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  content_type text,
  size_bytes integer,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index task_comment_attachments_comment_id_idx
  on public.task_comment_attachments (comment_id);

alter table public.task_comment_attachments enable row level security;

create policy "Users can view attachments on accessible comments"
  on public.task_comment_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      where c.id = task_comment_attachments.comment_id
        and public.can_view_list(t.list_id)
    )
  );

create policy "Authors can attach files to own comments"
  on public.task_comment_attachments for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      where c.id = task_comment_attachments.comment_id
        and c.created_by = auth.uid()
        and public.can_view_list(t.list_id)
    )
  );

create policy "Authors and project admins can delete comment attachments"
  on public.task_comment_attachments for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      join public.lists l on l.id = t.list_id
      where c.id = task_comment_attachments.comment_id
        and (
          public.is_project_admin(l.project_id)
          or public.is_platform_admin()
        )
    )
  );

grant select, insert, delete on public.task_comment_attachments to authenticated;
