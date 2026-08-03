-- Inline replies on task comments (one level of nesting)

alter table public.task_comments
  add column if not exists parent_id uuid references public.task_comments (id) on delete cascade;

create index if not exists task_comments_parent_id_idx
  on public.task_comments (parent_id);

-- Replies must belong to the same task as their parent
create or replace function public.task_comments_enforce_parent_task()
returns trigger
language plpgsql
as $$
declare
  parent_task_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select c.task_id, c.parent_id
    into parent_task_id, parent_parent_id
  from public.task_comments c
  where c.id = new.parent_id;

  if parent_task_id is null then
    raise exception 'Parent comment not found';
  end if;

  if parent_task_id <> new.task_id then
    raise exception 'Reply must belong to the same task as its parent';
  end if;

  -- Flat threading: only reply to root comments
  if parent_parent_id is not null then
    raise exception 'Cannot reply to a reply';
  end if;

  return new;
end;
$$;

drop trigger if exists task_comments_enforce_parent_task on public.task_comments;
create trigger task_comments_enforce_parent_task
  before insert or update of parent_id, task_id on public.task_comments
  for each row execute function public.task_comments_enforce_parent_task();
