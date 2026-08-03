-- Project-scoped sequential task keys (e.g. PC-1)

alter table public.projects
  add column if not exists next_task_number integer not null default 1;

alter table public.tasks
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

alter table public.tasks
  add column if not exists number integer;

alter table public.tasks
  add column if not exists key text;

-- Backfill project_id from lists
update public.tasks t
set project_id = l.project_id
from public.lists l
where t.list_id = l.id
  and t.project_id is null;

alter table public.tasks
  alter column project_id set not null;

create index if not exists tasks_project_id_idx on public.tasks (project_id);

create or replace function public.project_task_prefix(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
  word text;
  cleaned text;
begin
  if p_name is null or btrim(p_name) = '' then
    return 'T';
  end if;

  foreach word in array regexp_split_to_array(btrim(p_name), '\s+')
  loop
    cleaned := regexp_replace(word, '[^A-Za-z]', '', 'g');
    if length(cleaned) > 0 then
      result := result || upper(left(cleaned, 1));
    end if;
  end loop;

  if result = '' then
    return 'T';
  end if;

  return result;
end;
$$;

-- Atomic number + key allocation
create or replace function public.allocate_task_key(
  p_project_id uuid,
  p_prefix text default null
)
returns table (task_number integer, task_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  prefix text;
  project_name text;
begin
  select name into project_name
  from public.projects
  where id = p_project_id
  for update;

  if project_name is null then
    raise exception 'Project not found';
  end if;

  prefix := coalesce(
    nullif(btrim(coalesce(p_prefix, '')), ''),
    public.project_task_prefix(project_name)
  );

  update public.projects
  set next_task_number = next_task_number + 1
  where id = p_project_id
  returning next_task_number - 1 into n;

  task_number := n;
  task_key := prefix || '-' || n::text;
  return next;
end;
$$;

revoke all on function public.allocate_task_key(uuid, text) from public, anon;
grant execute on function public.allocate_task_key(uuid, text) to authenticated;

revoke all on function public.project_task_prefix(text) from public, anon;
grant execute on function public.project_task_prefix(text) to authenticated;

-- Backfill numbers/keys per project in created_at order
do $$
declare
  r record;
  t record;
  n integer;
  prefix text;
begin
  for r in
    select p.id, p.name
    from public.projects p
  loop
    prefix := public.project_task_prefix(r.name);
    n := 0;
    for t in
      select id
      from public.tasks
      where project_id = r.id
      order by created_at asc, id asc
    loop
      n := n + 1;
      update public.tasks
      set
        number = n,
        key = prefix || '-' || n::text
      where id = t.id;
    end loop;

    update public.projects
    set next_task_number = n + 1
    where id = r.id;
  end loop;
end;
$$;

alter table public.tasks
  alter column number set not null;

alter table public.tasks
  alter column key set not null;

create unique index if not exists tasks_project_id_number_uidx
  on public.tasks (project_id, number);

create unique index if not exists tasks_project_id_key_uidx
  on public.tasks (project_id, key);

-- Keep project_id in sync with list
create or replace function public.tasks_set_project_id_from_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select l.project_id into new.project_id
  from public.lists l
  where l.id = new.list_id;

  if new.project_id is null then
    raise exception 'List not found for task';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_set_project_id_from_list on public.tasks;
create trigger tasks_set_project_id_from_list
  before insert or update of list_id on public.tasks
  for each row
  execute function public.tasks_set_project_id_from_list();
