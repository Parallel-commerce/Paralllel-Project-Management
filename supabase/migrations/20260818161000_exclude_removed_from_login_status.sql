-- Exclude soft-deleted (removed) profiles from login-status listings
-- so admin Ops metrics don't count removed customers as "never signed in".

create or replace function public.list_user_login_status(p_user_ids uuid[] default null)
returns table (
  user_id uuid,
  last_sign_in_at timestamptz,
  has_active_session boolean,
  auth_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select
    u.id as user_id,
    u.last_sign_in_at,
    exists (
      select 1
      from auth.sessions s
      where s.user_id = u.id
        and (s.not_after is null or s.not_after > now())
    ) as has_active_session,
    case
      when u.last_sign_in_at is null then 'never_logged_in'
      when exists (
        select 1
        from auth.sessions s
        where s.user_id = u.id
          and (s.not_after is null or s.not_after > now())
      ) then 'logged_in'
      else 'logged_out'
    end as auth_status
  from auth.users u
  inner join public.profiles p on p.id = u.id
  where p.deleted_at is null
    and (
      p_user_ids is null
      or u.id = any (p_user_ids)
    );
end;
$$;

revoke all on function public.list_user_login_status(uuid[]) from public;
grant execute on function public.list_user_login_status(uuid[]) to authenticated;
