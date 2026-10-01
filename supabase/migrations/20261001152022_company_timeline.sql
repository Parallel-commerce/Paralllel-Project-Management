-- Dated notes and recorded changes on a CRM company, shown as a timeline.

create table public.company_timeline_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null default 'note',
  body text not null,
  occurred_on date not null default ((now() at time zone 'utc')::date),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_timeline_entries_kind_check
    check (kind in ('note', 'event')),
  constraint company_timeline_entries_body_check
    check (char_length(btrim(body)) between 1 and 4000)
);

comment on table public.company_timeline_entries is
  'Notes and recorded changes on a CRM company, ordered by the day they happened.';

comment on column public.company_timeline_entries.kind is
  'note: written by someone. event: recorded automatically when the company changes.';

comment on column public.company_timeline_entries.occurred_on is
  'The day the note or change happened. Notes can be backdated.';

create index company_timeline_entries_company_occurred_idx
  on public.company_timeline_entries (company_id, occurred_on desc, created_at desc);

create index company_timeline_entries_created_by_idx
  on public.company_timeline_entries (created_by);

create trigger company_timeline_entries_set_updated_at
  before update on public.company_timeline_entries
  for each row execute function public.set_updated_at();

create or replace function public.protect_company_timeline_entry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.kind <> 'note' then
    raise exception 'Only notes can be edited';
  end if;
  if new.kind is distinct from old.kind
     or new.company_id is distinct from old.company_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Timeline notes can only change their text and date';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_company_timeline_entry() from public, anon, authenticated;

drop trigger if exists company_timeline_entries_protect on public.company_timeline_entries;
create trigger company_timeline_entries_protect
  before update on public.company_timeline_entries
  for each row execute function public.protect_company_timeline_entry();

alter table public.company_timeline_entries enable row level security;

create policy "CRM users can view company timeline"
  on public.company_timeline_entries for select
  to authenticated
  using ((select public.is_crm_user()));

create policy "CRM users can add company timeline entries"
  on public.company_timeline_entries for insert
  to authenticated
  with check (
    (select public.is_crm_user())
    and created_by = (select auth.uid())
  );

create policy "CRM users can update company notes"
  on public.company_timeline_entries for update
  to authenticated
  using (
    (select public.is_crm_user())
    and kind = 'note'
  )
  with check (
    (select public.is_crm_user())
    and kind = 'note'
  );

create policy "CRM users can delete company notes"
  on public.company_timeline_entries for delete
  to authenticated
  using (
    (select public.is_crm_user())
    and kind = 'note'
  );

revoke all on public.company_timeline_entries from anon, public;
grant select, insert, update, delete on public.company_timeline_entries to authenticated;

insert into public.company_timeline_entries (
  company_id,
  kind,
  body,
  occurred_on,
  created_by,
  created_at
)
select
  c.id,
  'event',
  'Added to CRM',
  (c.created_at at time zone 'utc')::date,
  c.created_by,
  c.created_at
from public.companies c;
