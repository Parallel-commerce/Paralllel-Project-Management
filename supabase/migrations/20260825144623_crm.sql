-- Internal CRM: companies (prospects) with child contacts and optional project link.

create type public.company_status as enum (
  'lead',
  'contacted',
  'proposal',
  'won',
  'lost'
);

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.project_members pm
      where pm.user_id = (select auth.uid())
        and pm.role in ('admin', 'member')
    );
$$;

revoke all on function public.is_internal_user() from public, anon;
grant execute on function public.is_internal_user() to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  notes text,
  status public.company_status not null default 'lead',
  follow_up_at date,
  follow_up_note text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_status_idx on public.companies (status);
create index companies_follow_up_at_idx
  on public.companies (follow_up_at)
  where follow_up_at is not null;
create index companies_created_by_idx on public.companies (created_by);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  title text,
  notes text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_company_id_idx on public.contacts (company_id);
create unique index contacts_one_primary_per_company_idx
  on public.contacts (company_id)
  where is_primary;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create or replace function public.ensure_single_primary_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_primary then
    update public.contacts
    set is_primary = false
    where company_id = new.company_id
      and id is distinct from new.id
      and is_primary;
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_single_primary_contact() from public, anon, authenticated;

drop trigger if exists contacts_ensure_single_primary on public.contacts;
create trigger contacts_ensure_single_primary
  before insert or update of is_primary, company_id on public.contacts
  for each row execute function public.ensure_single_primary_contact();

alter table public.projects
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists projects_company_id_idx on public.projects (company_id);

alter table public.companies enable row level security;
alter table public.contacts enable row level security;

create policy "Internal team can view companies"
  on public.companies for select
  to authenticated
  using ((select public.is_internal_user()));

create policy "Internal team can create companies"
  on public.companies for insert
  to authenticated
  with check (
    (select public.is_internal_user())
    and created_by = (select auth.uid())
  );

create policy "Internal team can update companies"
  on public.companies for update
  to authenticated
  using ((select public.is_internal_user()))
  with check ((select public.is_internal_user()));

create policy "Internal team can delete companies"
  on public.companies for delete
  to authenticated
  using ((select public.is_internal_user()));

create policy "Internal team can view contacts"
  on public.contacts for select
  to authenticated
  using ((select public.is_internal_user()));

create policy "Internal team can create contacts"
  on public.contacts for insert
  to authenticated
  with check ((select public.is_internal_user()));

create policy "Internal team can update contacts"
  on public.contacts for update
  to authenticated
  using ((select public.is_internal_user()))
  with check ((select public.is_internal_user()));

create policy "Internal team can delete contacts"
  on public.contacts for delete
  to authenticated
  using ((select public.is_internal_user()));

grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
