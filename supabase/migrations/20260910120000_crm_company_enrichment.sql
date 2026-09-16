-- Company summaries and LinkedIn URLs from CRM enrichment.

alter table public.companies
  add column if not exists summary text,
  add column if not exists linkedin_url text,
  add column if not exists enriched_at timestamptz;

alter table public.contacts
  add column if not exists linkedin_url text;

comment on column public.companies.summary is 'Public company summary, usually from enrichment.';
comment on column public.companies.linkedin_url is 'Company LinkedIn page URL.';
comment on column public.companies.enriched_at is 'When enrichment last wrote summary/LinkedIn fields.';
comment on column public.contacts.linkedin_url is 'Contact LinkedIn profile URL.';
