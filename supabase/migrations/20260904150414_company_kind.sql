-- Relationship type for CRM companies, separate from sales-pipeline status.

create type public.company_kind as enum (
  'prospect',
  'lost_opportunity',
  'customer',
  'agency'
);

alter table public.companies
  add column kind public.company_kind not null default 'prospect';

update public.companies
set kind = case status
  when 'won' then 'customer'::public.company_kind
  when 'lost' then 'lost_opportunity'::public.company_kind
  else 'prospect'::public.company_kind
end;

create index companies_kind_idx on public.companies (kind);
