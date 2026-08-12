-- Parallel is passwordless/invite-only. Unconfirmed users get "Confirm signup"
-- emails (no OTP code) instead of the Magic Link template.

-- Confirm everyone who is still pending.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;

-- Auto-confirm on create BEFORE insert so Auth sends Magic Link / OTP, not Confirm signup.
create or replace function public.auth_users_autoconfirm()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_autoconfirm on auth.users;
create trigger on_auth_user_autoconfirm
  before insert on auth.users
  for each row execute function public.auth_users_autoconfirm();

-- Keep profile bootstrap as AFTER INSERT would break the auth.users FK.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
