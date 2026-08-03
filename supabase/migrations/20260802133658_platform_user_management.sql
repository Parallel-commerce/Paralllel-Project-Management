-- Platform admins for app-wide user management

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_platform_admin
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Bootstrap existing operator
update public.profiles
set is_platform_admin = true
where lower(email) = lower('matt@parallelcommerce.co.uk');

-- Prevent demoting the last platform admin
create or replace function public.prevent_last_platform_admin_demotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean := false;
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    if auth.uid() = old.id then
      actor_is_admin := old.is_platform_admin;
    else
      select p.is_platform_admin into actor_is_admin
      from public.profiles p
      where p.id = auth.uid();
    end if;

    if not coalesce(actor_is_admin, false) then
      raise exception 'Only platform admins can change platform admin status';
    end if;

    if old.is_platform_admin = true and new.is_platform_admin = false then
      if (
        select count(*)::int
        from public.profiles p
        where p.is_platform_admin = true
          and p.id <> old.id
      ) = 0 then
        raise exception 'Cannot demote the last platform admin';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_last_platform_admin on public.profiles;
create trigger profiles_prevent_last_platform_admin
  before update on public.profiles
  for each row execute function public.prevent_last_platform_admin_demotion();

revoke all on function public.prevent_last_platform_admin_demotion() from public, anon, authenticated;

-- Profiles: platform admins can read everyone
drop policy if exists "Users can view profiles of shared project members" on public.profiles;
create policy "Users can view profiles of shared project members"
  on public.profiles for select
  to authenticated
  using (
    public.is_platform_admin()
    or id = auth.uid()
    or exists (
      select 1
      from public.project_members mine
      join public.project_members theirs
        on mine.project_id = theirs.project_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Platform admins can update profiles" on public.profiles;
create policy "Platform admins can update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Projects: platform admins can see all
drop policy if exists "Members and creators can view projects" on public.projects;
drop policy if exists "Members can view their projects" on public.projects;
create policy "Members and creators can view projects"
  on public.projects for select
  to authenticated
  using (
    public.is_platform_admin()
    or created_by = auth.uid()
    or public.is_project_member(id)
  );

-- Project members: platform admin full manage
drop policy if exists "Members can view project membership" on public.project_members;
create policy "Members can view project membership"
  on public.project_members for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

drop policy if exists "Admins can update members" on public.project_members;
create policy "Admins can update members"
  on public.project_members for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

drop policy if exists "Admins can delete members" on public.project_members;
create policy "Admins can delete members"
  on public.project_members for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );
