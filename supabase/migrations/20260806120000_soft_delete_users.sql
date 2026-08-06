-- Soft-delete users while preserving attributed content (tasks, messages, etc.)

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

create or replace function public.soft_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  original_email text;
  original_name text;
  was_admin boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  select email, full_name, is_platform_admin
  into original_email, original_name, was_admin
  from public.profiles
  where id = p_user_id
    and deleted_at is null
  for update;

  if original_email is null then
    raise exception 'User not found or already removed.';
  end if;

  if was_admin then
    if (
      select count(*)::int
      from public.profiles p
      where p.is_platform_admin = true
        and p.deleted_at is null
        and p.id <> p_user_id
    ) = 0 then
      raise exception 'Cannot delete the last platform admin.';
    end if;
  end if;

  delete from public.project_members where user_id = p_user_id;
  delete from public.project_invites where lower(email) = lower(original_email);
  delete from public.notifications where user_id = p_user_id;

  update public.tasks
  set assigned_to = null
  where assigned_to = p_user_id;

  -- Stop any running timers; keep history rows
  update public.time_entries
  set
    ended_at = coalesce(ended_at, now()),
    duration_seconds = coalesce(
      duration_seconds,
      greatest(0, floor(extract(epoch from (now() - started_at)))::int)
    )
  where user_id = p_user_id
    and ended_at is null;

  update public.profiles
  set
    deleted_at = now(),
    is_platform_admin = false,
    title = null,
    avatar_path = null,
    full_name = coalesce(
      nullif(btrim(original_name), ''),
      split_part(original_email, '@', 1)
    ),
    email = 'deleted+' || p_user_id::text || '@removed.invalid',
    updated_at = now()
  where id = p_user_id;

  -- Invalidate auth login for this identity (email freed for future invites)
  begin
    update auth.users
    set
      email = 'deleted+' || id::text || '@removed.invalid',
      phone = null,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('deleted', true)
    where id = p_user_id;

    delete from auth.sessions where user_id = p_user_id;
    delete from auth.refresh_tokens where user_id = p_user_id;
  exception
    when insufficient_privilege then
      -- Profile soft-delete still applies; app middleware blocks access
      null;
    when undefined_table then
      null;
  end;
end;
$$;

revoke all on function public.soft_delete_user(uuid) from public;
grant execute on function public.soft_delete_user(uuid) to authenticated;
