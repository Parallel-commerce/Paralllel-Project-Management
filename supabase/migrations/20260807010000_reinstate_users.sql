-- Preserve original email on soft-delete so users can be reinstated

alter table public.profiles
  add column if not exists previous_email text;

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
    previous_email = lower(original_email),
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

  begin
    update auth.users
    set
      email = 'deleted+' || id::text || '@removed.invalid',
      phone = null,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('deleted', true, 'previous_email', lower(original_email))
    where id = p_user_id;

    delete from auth.sessions where user_id = p_user_id;
    delete from auth.refresh_tokens where user_id = p_user_id;
  exception
    when insufficient_privilege then
      null;
    when undefined_table then
      null;
  end;
end;
$$;

create or replace function public.reinstate_user(p_user_id uuid, p_email text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  restore_email text;
  existing_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;

  select coalesce(nullif(lower(btrim(p_email)), ''), previous_email)
    into restore_email
  from public.profiles
  where id = p_user_id
    and deleted_at is not null
  for update;

  if restore_email is null then
    raise exception 'User not found, not removed, or no email to restore. Provide an email.';
  end if;

  if restore_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  select id into existing_id
  from public.profiles
  where lower(email) = restore_email
    and deleted_at is null
    and id <> p_user_id
  limit 1;

  if existing_id is not null then
    raise exception 'That email is already in use by an active user.';
  end if;

  update public.profiles
  set
    email = restore_email,
    previous_email = null,
    deleted_at = null,
    updated_at = now()
  where id = p_user_id;

  begin
    update auth.users
    set
      email = restore_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        - 'deleted'
        - 'previous_email'
    where id = p_user_id;
  exception
    when insufficient_privilege then
      null;
    when unique_violation then
      raise exception 'That email is already in use in auth.';
    when undefined_table then
      null;
  end;
end;
$$;

revoke all on function public.soft_delete_user(uuid) from public;
grant execute on function public.soft_delete_user(uuid) to authenticated;

revoke all on function public.reinstate_user(uuid, text) from public;
grant execute on function public.reinstate_user(uuid, text) to authenticated;
