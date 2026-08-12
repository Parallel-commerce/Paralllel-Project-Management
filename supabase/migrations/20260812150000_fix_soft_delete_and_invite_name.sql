-- Harden soft-delete so auth session cleanup failures don't roll back profile removal.
-- Also stamp invited full_name/title onto new auth users via handle_new_user.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, title)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'title', '')), '')
  );

  insert into public.project_members (project_id, user_id, role)
  select pi.project_id, new.id, pi.role
  from public.project_invites pi
  where lower(pi.email) = lower(new.email)
  on conflict do nothing;

  delete from public.project_invites
  where lower(email) = lower(new.email);

  return new;
end;
$$;

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

  -- Best-effort auth invalidation. Never roll back the profile soft-delete
  -- if auth tables reject the update (permissions, FKs, etc.).
  -- Note: email identities use user UUID as provider_id — do not overwrite it.
  begin
    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object(
          'email', tombstone_email,
          'deleted', true,
          'previous_email', lower(original_email)
        ),
      email = tombstone_email
    where user_id = p_user_id;

    update auth.users
    set
      email = tombstone_email,
      phone = null,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('deleted', true, 'previous_email', lower(original_email))
    where id = p_user_id;

    delete from auth.refresh_tokens where user_id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;
  exception
    when others then
      raise warning 'soft_delete_user auth cleanup failed for %: %', p_user_id, sqlerrm;
  end;
end;
$$;
