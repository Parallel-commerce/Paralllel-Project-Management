-- Faster project/list task counts + denormalized chat previews

create or replace function public.project_task_stats(p_project_ids uuid[])
returns table (
  project_id uuid,
  status public.task_status,
  task_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.project_id,
    t.status,
    count(*)::bigint as task_count
  from public.tasks t
  where t.project_id = any (p_project_ids)
    and t.archived_at is null
  group by t.project_id, t.status;
$$;

create or replace function public.list_task_stats(p_project_id uuid)
returns table (
  list_id uuid,
  status public.task_status,
  task_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.list_id,
    t.status,
    count(*)::bigint as task_count
  from public.tasks t
  where t.project_id = p_project_id
    and t.archived_at is null
  group by t.list_id, t.status;
$$;

grant execute on function public.project_task_stats(uuid[]) to authenticated;
grant execute on function public.list_task_stats(uuid) to authenticated;

alter table public.conversations
  add column if not exists last_message_body text,
  add column if not exists last_message_at timestamptz;

create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    updated_at = now(),
    last_message_body = left(new.body, 500),
    last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

-- Backfill previews from latest message per conversation
update public.conversations c
set
  last_message_body = m.body,
  last_message_at = m.created_at
from (
  select distinct on (conversation_id)
    conversation_id,
    left(body, 500) as body,
    created_at
  from public.messages
  order by conversation_id, created_at desc
) m
where c.id = m.conversation_id;
