-- Yes / No / Not applicable for CRM re-engagement.

do $$ begin
  create type public.company_reengage as enum (
    'yes',
    'no',
    'not_applicable'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.companies
  alter column can_reengage type public.company_reengage
  using (
    case can_reengage
      when true then 'yes'::public.company_reengage
      when false then 'no'::public.company_reengage
      else null
    end
  );

comment on column public.companies.can_reengage is
  'Whether this company can be approached again for work: yes, no, or not applicable.';
