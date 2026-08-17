-- Nested replies (reply-to-reply) and comment @mentions

create or replace function public.task_comments_enforce_parent_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_task_id uuid;
  walk_id uuid;
  depth int := 0;
  max_depth constant int := 10;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Comment cannot reply to itself';
  end if;

  select c.task_id
    into parent_task_id
  from public.task_comments c
  where c.id = new.parent_id;

  if parent_task_id is null then
    raise exception 'Parent comment not found';
  end if;

  if parent_task_id <> new.task_id then
    raise exception 'Reply must belong to the same task as its parent';
  end if;

  walk_id := new.parent_id;
  while walk_id is not null loop
    depth := depth + 1;
    if depth > max_depth then
      raise exception 'Reply is nested too deeply';
    end if;
    if walk_id = new.id then
      raise exception 'Comment reply cycle is not allowed';
    end if;
    select c.parent_id
      into walk_id
    from public.task_comments c
    where c.id = walk_id;
  end loop;

  return new;
end;
$$;

create table public.task_comment_mentions (
  comment_id uuid not null references public.task_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index task_comment_mentions_user_id_idx
  on public.task_comment_mentions (user_id);

alter table public.task_comment_mentions enable row level security;

create policy "Users can view mentions on accessible comments"
  on public.task_comment_mentions for select
  to authenticated
  using (
    exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      where c.id = task_comment_mentions.comment_id
        and public.can_view_list(t.list_id)
    )
  );

create policy "Authors can mention project members on own comments"
  on public.task_comment_mentions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      join public.project_members pm
        on pm.project_id = t.project_id
       and pm.user_id = task_comment_mentions.user_id
      where c.id = task_comment_mentions.comment_id
        and c.created_by = auth.uid()
    )
  );

grant select, insert on public.task_comment_mentions to authenticated;
