-- Let project members read their plan type without exposing full engagement.

create or replace function public.project_plan_type(p_project_id uuid)
returns public.project_type
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

  return plan;
end;
$$;

grant execute on function public.project_plan_type(uuid) to authenticated;
