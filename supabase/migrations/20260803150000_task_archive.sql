-- Auto-archive done tasks after 30 days (exclude from board, keep accessible)

alter table public.tasks
  add column if not exists completed_at timestamptz;

alter table public.tasks
  add column if not exists archived_at timestamptz;

create index if not exists tasks_archived_at_idx
  on public.tasks (list_id, archived_at);

create index if not exists tasks_completed_at_idx
  on public.tasks (completed_at)
  where status = 'done' and archived_at is null;

-- Track when a task enters/leaves done; reopening clears archive
create or replace function public.tasks_track_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_track_completed_at on public.tasks;
create trigger tasks_track_completed_at
  before insert or update of status on public.tasks
  for each row execute function public.tasks_track_completed_at();

-- Archive eligible done tasks (optionally scoped to list or project)
create or replace function public.archive_eligible_tasks(
  p_list_id uuid default null,
  p_project_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_list_id is null and p_project_id is null then
    raise exception 'list or project scope required';
  end if;

  if p_list_id is not null and not public.can_view_list(p_list_id) then
    raise exception 'not allowed';
  end if;

  if p_project_id is not null
     and not (
       public.is_project_member(p_project_id)
       or public.is_platform_admin()
     ) then
    raise exception 'not allowed';
  end if;

  update public.tasks
  set archived_at = now()
  where status = 'done'
    and archived_at is null
    and completed_at is not null
    and completed_at <= now() - interval '30 days'
    and (p_list_id is null or list_id = p_list_id)
    and (p_project_id is null or project_id = p_project_id);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.archive_eligible_tasks(uuid, uuid) from public;
grant execute on function public.archive_eligible_tasks(uuid, uuid) to authenticated;

-- Backfill: use updated_at as best-effort completed time for existing done tasks
update public.tasks
set completed_at = coalesce(completed_at, updated_at, created_at)
where status = 'done'
  and completed_at is null;

-- Immediately archive anything already past the 30-day window
update public.tasks
set archived_at = coalesce(archived_at, now())
where status = 'done'
  and archived_at is null
  and completed_at is not null
  and completed_at <= now() - interval '30 days';
