-- Repair soft-deleted users whose auth.email was left as the real address,
-- expose login status for platform admins, and block invites that collide
-- with an active or removed account email.

-- 1) Repair auth emails for already soft-deleted profiles
do $$
declare
  r record;
  tombstone text;
begin
  for r in
    select p.id, p.previous_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.deleted_at is not null
      and p.previous_email is not null
      and lower(u.email) = lower(p.previous_email)
  loop
    tombstone := 'deleted+' || r.id::text || '@removed.invalid';
    begin
      update auth.identities
      set
        identity_data = coalesce(identity_data, '{}'::jsonb)
          || jsonb_build_object(
            'email', tombstone,
            'deleted', true,
            'previous_email', lower(r.previous_email)
          ),
        provider_id = case
          when provider = 'email' then tombstone
          else provider_id
        end,
        email = tombstone
      where user_id = r.id;

      update auth.users
      set
        email = tombstone,
        phone = null,
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object(
            'deleted', true,
            'previous_email', lower(r.previous_email)
          )
      where id = r.id;

      delete from auth.refresh_tokens where user_id = r.id;
      delete from auth.sessions where user_id = r.id;
    exception
      when others then
        raise warning 'Could not repair auth email for %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

-- 2) Unique active emails only (deleted rows use tombstone emails already).
-- Reinstate uniqueness if somehow missing.
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- Prevent inviting an email that belongs to a removed account's previous_email
-- unless that account is reinstated first.
create or replace function public.find_profile_by_invite_email(p_email text)
returns table (
  profile_id uuid,
  is_deleted boolean,
  email text,
  previous_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := lower(btrim(p_email));
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;

  return query
  select
    p.id,
    p.deleted_at is not null,
    p.email,
    p.previous_email
  from public.profiles p
  where lower(p.email) = normalized
     or lower(coalesce(p.previous_email, '')) = normalized
  order by p.deleted_at nulls first
  limit 1;
end;
$$;

revoke all on function public.find_profile_by_invite_email(text) from public;
grant execute on function public.find_profile_by_invite_email(text) to authenticated;

-- 3) Login status for Users page (never_logged_in | logged_in | logged_out)
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
  where p_user_ids is null
     or u.id = any (p_user_ids);
end;
$$;

revoke all on function public.list_user_login_status(uuid[]) from public;
grant execute on function public.list_user_login_status(uuid[]) to authenticated;

-- 4) Also update reinstate to restore auth identity emails
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

  -- Also block if another auth user already owns this email
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
    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', restore_email)
        - 'deleted'
        - 'previous_email',
      provider_id = case
        when provider = 'email' then restore_email
        else provider_id
      end,
      email = restore_email
    where user_id = p_user_id;

    update auth.users
    set
      email = restore_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        - 'deleted'
        - 'previous_email'
    where id = p_user_id;
  exception
    when unique_violation then
      raise exception 'That email is already in use in auth.';
    when others then
      raise warning 'reinstate_user auth restore failed for %: %', p_user_id, sqlerrm;
  end;
end;
$$;
