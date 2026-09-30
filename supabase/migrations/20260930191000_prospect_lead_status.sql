-- Lead status applies only to prospects. Clear it for every other company type.

alter table public.companies
  alter column status drop not null;

alter table public.companies
  alter column status drop default;

-- Close out won/lost prospects into the matching company type.
update public.companies
set
  kind = 'customer',
  status = null
where kind = 'prospect'
  and status = 'won';

update public.companies
set
  kind = 'lost_opportunity',
  status = null
where kind = 'prospect'
  and status = 'lost';

update public.companies
set status = null
where kind <> 'prospect';

update public.companies
set status = 'lead'
where kind = 'prospect'
  and status is null;

alter table public.companies
  alter column status set default 'lead';

alter table public.companies
  drop constraint if exists companies_status_prospect_only;

alter table public.companies
  add constraint companies_status_prospect_only
  check (
    (kind = 'prospect' and status is not null)
    or (kind <> 'prospect' and status is null)
  );
