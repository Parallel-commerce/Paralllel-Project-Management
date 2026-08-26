-- Shared manual order for the projects screen.

alter table public.projects
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    (row_number() over (order by created_at desc) - 1)::integer as rn
  from public.projects
)
update public.projects p
set sort_order = ranked.rn
from ranked
where p.id = ranked.id
  and p.sort_order is null;

alter table public.projects
  alter column sort_order set default 0,
  alter column sort_order set not null;

create index if not exists projects_sort_order_idx
  on public.projects (sort_order, created_at desc);

create or replace function public.projects_assign_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(sort_order), -1) + 1
  into new.sort_order
  from public.projects;
  return new;
end;
$$;

drop trigger if exists projects_assign_sort_order on public.projects;
create trigger projects_assign_sort_order
  before insert on public.projects
  for each row
  execute function public.projects_assign_sort_order();

revoke all on function public.projects_assign_sort_order() from public, anon, authenticated;

create or replace function public.reorder_projects(p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  visible_count integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_internal_user() then
    raise exception 'Only team members can reorder projects';
  end if;

  if p_ordered_ids is null or coalesce(cardinality(p_ordered_ids), 0) = 0 then
    return;
  end if;

  if (
    select count(distinct project_id)
    from unnest(p_ordered_ids) as project_id
  ) <> cardinality(p_ordered_ids) then
    raise exception 'Duplicate project ids';
  end if;

  select count(*)
  into visible_count
  from public.projects p
  where p.id = any (p_ordered_ids)
    and (
      p.created_by = uid
      or exists (
        select 1
        from public.project_members pm
        where pm.project_id = p.id
          and pm.user_id = uid
      )
    );

  if visible_count is distinct from cardinality(p_ordered_ids) then
    raise exception 'One or more projects are not accessible';
  end if;

  with incoming as (
    select id, ordinality as new_pos
    from unnest(p_ordered_ids) with ordinality as t(id, ordinality)
  ),
  current_vals as (
    select
      p.id,
      p.sort_order,
      row_number() over (order by p.sort_order, p.created_at desc, p.id) as old_pos
    from public.projects p
    join incoming i on i.id = p.id
  ),
  assigned as (
    select i.id, c.sort_order
    from incoming i
    join current_vals c on c.old_pos = i.new_pos
  )
  update public.projects p
  set sort_order = assigned.sort_order
  from assigned
  where p.id = assigned.id;
end;
$$;

revoke all on function public.reorder_projects(uuid[]) from public, anon;
grant execute on function public.reorder_projects(uuid[]) to authenticated;
