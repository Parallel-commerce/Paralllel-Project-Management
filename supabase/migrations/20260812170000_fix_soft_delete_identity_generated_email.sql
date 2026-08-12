-- identities.email is GENERATED — never assign it. Update auth.users first,
-- then only identity_data, then wipe sessions.

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
  tombstone_email text;
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

  tombstone_email := 'deleted+' || p_user_id::text || '@removed.invalid';

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
    email = tombstone_email,
    updated_at = now()
  where id = p_user_id;

  begin
    update auth.users
    set
      email = tombstone_email,
      phone = null,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('deleted', true, 'previous_email', lower(original_email))
    where id = p_user_id;

    -- identities.email is generated from identity_data; only patch identity_data.
    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object(
          'email', tombstone_email,
          'deleted', true,
          'previous_email', lower(original_email)
        )
    where user_id = p_user_id;

    delete from auth.refresh_tokens where user_id = p_user_id::text;
    delete from auth.sessions where user_id = p_user_id;
  exception
    when others then
      raise warning 'soft_delete_user auth cleanup failed for %: %', p_user_id, sqlerrm;
  end;
end;
$$;

-- Repair remaining soft-deleted auth emails
update auth.users u
set
  email = 'deleted+' || u.id::text || '@removed.invalid',
  phone = null,
  raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'deleted', true,
      'previous_email',
      lower(coalesce(p.previous_email, u.email))
    )
from public.profiles p
where p.id = u.id
  and p.deleted_at is not null
  and u.email not like 'deleted+%@removed.invalid';

update auth.identities i
set
  identity_data = coalesce(i.identity_data, '{}'::jsonb)
    || jsonb_build_object(
      'email', 'deleted+' || i.user_id::text || '@removed.invalid',
      'deleted', true
    )
where i.user_id in (select id from public.profiles where deleted_at is not null);

delete from auth.refresh_tokens
where user_id in (
  select id::text from public.profiles where deleted_at is not null
);

delete from auth.sessions
where user_id in (select id from public.profiles where deleted_at is not null);

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
  where (
      lower(email) = restore_email
      or lower(coalesce(previous_email, '')) = restore_email
    )
    and deleted_at is null
    and id <> p_user_id
  limit 1;

  if existing_id is not null then
    raise exception 'That email is already in use by an active user.';
  end if;

  if exists (
    select 1
    from auth.users au
    where lower(au.email) = restore_email
      and au.id <> p_user_id
  ) then
    raise exception 'That email is already in use in auth.';
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

    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', restore_email)
        - 'deleted'
        - 'previous_email'
    where user_id = p_user_id;
  exception
    when unique_violation then
      raise exception 'That email is already in use in auth.';
    when others then
      raise warning 'reinstate_user auth restore failed for %: %', p_user_id, sqlerrm;
  end;
end;
$$;
