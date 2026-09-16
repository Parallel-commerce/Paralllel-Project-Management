-- Whether a company can be approached again for work.

alter table public.companies
  add column if not exists can_reengage boolean;

comment on column public.companies.can_reengage is 'Whether this company can be approached again for work.';
