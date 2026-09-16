-- Shared industry verticals for CRM companies. Companies can have several;
-- the names are reused across the book so you can filter who you work with.

create table public.verticals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint verticals_name_trimmed_chk
    check (name = btrim(name) and char_length(name) between 1 and 60)
);

create unique index verticals_name_lower_idx on public.verticals (lower(name));

create table public.company_verticals (
  company_id uuid not null references public.companies (id) on delete cascade,
  vertical_id uuid not null references public.verticals (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (company_id, vertical_id)
);

create index company_verticals_vertical_id_idx
  on public.company_verticals (vertical_id);

comment on table public.verticals is
  'Industry verticals shared across CRM companies.';
comment on table public.company_verticals is
  'Which verticals a CRM company works in.';

alter table public.verticals enable row level security;
alter table public.company_verticals enable row level security;

create policy "CRM users can view verticals"
  on public.verticals for select
  to authenticated
  using ((select public.is_crm_user()));

create policy "CRM users can create verticals"
  on public.verticals for insert
  to authenticated
  with check ((select public.is_crm_user()));

create policy "CRM users can update verticals"
  on public.verticals for update
  to authenticated
  using ((select public.is_crm_user()))
  with check ((select public.is_crm_user()));

create policy "CRM users can view company verticals"
  on public.company_verticals for select
  to authenticated
  using ((select public.is_crm_user()));

create policy "CRM users can create company verticals"
  on public.company_verticals for insert
  to authenticated
  with check ((select public.is_crm_user()));

create policy "CRM users can delete company verticals"
  on public.company_verticals for delete
  to authenticated
  using ((select public.is_crm_user()));

grant select, insert, update on public.verticals to authenticated;
grant select, insert, delete on public.company_verticals to authenticated;
