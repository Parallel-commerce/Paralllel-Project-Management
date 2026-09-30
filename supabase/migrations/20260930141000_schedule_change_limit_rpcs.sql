-- Member-readable schedule + change-limit helpers (engagement stays internal-only).

create or replace function public.can_view_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.project_members m
      where m.project_id = p_project_id
        and m.user_id = auth.uid()
    );
$$;

create or replace function public.project_schedule_config(p_project_id uuid)
returns table (
  scheduled_weekdays smallint[],
  schedule_cadence public.schedule_cadence,
  schedule_anchor_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_project(p_project_id) then
    raise exception 'Not allowed';
  end if;

  return query
  select
    coalesce(p.scheduled_weekdays, '{}'::smallint[]) as scheduled_weekdays,
    coalesce(e.schedule_cadence, 'weekly'::public.schedule_cadence) as schedule_cadence,
    coalesce(e.schedule_anchor_date, current_date) as schedule_anchor_date
  from public.projects p
  left join public.project_engagement e on e.project_id = p.id
  where p.id = p_project_id;
end;
$$;

create or replace function public.project_monthly_change_limit(p_project_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  plan public.project_type;
begin
  if not public.can_view_project(p_project_id) then
    raise exception 'Not allowed';
  end if;

  select e.project_type into plan
  from public.project_engagement e
  where e.project_id = p_project_id;

  if plan = 'maintain' then
    return 0;
  elsif plan = 'optimise' then
    return 2;
  elsif plan = 'accelerate' then
    return 4;
  else
    -- growth, new_website, enterprise_b2b, unset → unlimited
    return null;
  end if;
end;
$$;

grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.project_schedule_config(uuid) to authenticated;
grant execute on function public.project_monthly_change_limit(uuid) to authenticated;
