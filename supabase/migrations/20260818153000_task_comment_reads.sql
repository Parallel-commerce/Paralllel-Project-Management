-- Per-user dismiss/read state for homepage recent comments

create table public.task_comment_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.task_comments (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index task_comment_reads_comment_id_idx
  on public.task_comment_reads (comment_id);

alter table public.task_comment_reads enable row level security;

create policy "Users can view own comment reads"
  on public.task_comment_reads for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can mark comments read"
  on public.task_comment_reads for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      where c.id = task_comment_reads.comment_id
        and public.can_view_list(t.list_id)
    )
  );

create policy "Users can delete own comment reads"
  on public.task_comment_reads for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.task_comment_reads to authenticated;
