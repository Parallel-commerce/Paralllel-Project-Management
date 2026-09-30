-- Cadence is determined by plan. Add none for plans without a schedule.

alter type public.schedule_cadence add value if not exists 'none';

create or replace function public.cadence_for_project_type(p_type public.project_type)
returns public.schedule_cadence
language sql
immutable
as $$
  select case p_type
    when 'optimise' then 'fortnightly'::public.schedule_cadence
    when 'accelerate' then 'weekly'::public.schedule_cadence
    when 'growth' then 'every_3_days'::public.schedule_cadence
    else 'none'::public.schedule_cadence
  end;
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
    public.cadence_for_project_type(e.project_type) as schedule_cadence,
    coalesce(e.schedule_anchor_date, current_date) as schedule_anchor_date
  from public.projects p
  left join public.project_engagement e on e.project_id = p.id
  where p.id = p_project_id;
end;
$$;

-- Sync existing engagement rows to match their plan.
update public.project_engagement
set schedule_cadence = public.cadence_for_project_type(project_type)
where project_type is not null;

update public.project_engagement
set schedule_cadence = 'none'
where project_type is null;
