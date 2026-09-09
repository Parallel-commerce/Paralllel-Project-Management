-- Independent CRM access on profiles. Project access stays via memberships;
-- CRM is no longer implied by being an internal project member.

alter table public.profiles
  add column if not exists can_access_crm boolean not null default false;

update public.profiles p
set can_access_crm = true
where p.deleted_at is null
  and (
    p.is_platform_admin
    or exists (
      select 1
      from public.project_members pm
      where pm.user_id = p.id
        and pm.role in ('admin', 'member')
    )
  );

create or replace function public.is_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or coalesce(
      (
        select p.can_access_crm
        from public.profiles p
        where p.id = (select auth.uid())
      ),
      false
    );
$$;

revoke all on function public.is_crm_user() from public, anon;
grant execute on function public.is_crm_user() to authenticated;

create or replace function public.protect_crm_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.can_access_crm is distinct from old.can_access_crm
     and not public.is_platform_admin() then
    raise exception 'Only platform admins can change CRM access';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_crm_access on public.profiles;
create trigger profiles_protect_crm_access
  before update on public.profiles
  for each row execute function public.protect_crm_access();

revoke all on function public.protect_crm_access() from public, anon, authenticated;

drop policy if exists "Internal team can view companies" on public.companies;
create policy "CRM users can view companies"
  on public.companies for select
  to authenticated
  using ((select public.is_crm_user()));

drop policy if exists "Internal team can create companies" on public.companies;
create policy "CRM users can create companies"
  on public.companies for insert
  to authenticated
  with check (
    (select public.is_crm_user())
    and created_by = (select auth.uid())
  );

drop policy if exists "Internal team can update companies" on public.companies;
create policy "CRM users can update companies"
  on public.companies for update
  to authenticated
  using ((select public.is_crm_user()))
  with check ((select public.is_crm_user()));

drop policy if exists "Internal team can delete companies" on public.companies;
create policy "CRM users can delete companies"
  on public.companies for delete
  to authenticated
  using ((select public.is_crm_user()));

drop policy if exists "Internal team can view contacts" on public.contacts;
create policy "CRM users can view contacts"
  on public.contacts for select
  to authenticated
  using ((select public.is_crm_user()));

drop policy if exists "Internal team can create contacts" on public.contacts;
create policy "CRM users can create contacts"
  on public.contacts for insert
  to authenticated
  with check ((select public.is_crm_user()));

drop policy if exists "Internal team can update contacts" on public.contacts;
create policy "CRM users can update contacts"
  on public.contacts for update
  to authenticated
  using ((select public.is_crm_user()))
  with check ((select public.is_crm_user()));

drop policy if exists "Internal team can delete contacts" on public.contacts;
create policy "CRM users can delete contacts"
  on public.contacts for delete
  to authenticated
  using ((select public.is_crm_user()));
