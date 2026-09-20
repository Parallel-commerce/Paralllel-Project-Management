-- Core Web Vitals captures for storefront URLs (PageSpeed Insights).
-- One run per refresh; pages are homepage, collection, product, and cart.

create table public.project_store_speed_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source text not null default 'manual',
  origin_url text,
  origin_passed boolean,
  origin_lcp_ms integer,
  origin_inp_ms integer,
  origin_cls numeric(6, 3),
  origin_category text,
  digest jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint project_store_speed_runs_source_check
    check (source in ('manual', 'scheduled'))
);

create index project_store_speed_runs_project_captured_idx
  on public.project_store_speed_runs (project_id, captured_at desc);

create table public.project_store_speed_pages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.project_store_speed_runs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  page_kind text not null,
  url text not null,
  title text,
  performance_score integer,
  lab_lcp_ms integer,
  lab_tbt_ms integer,
  lab_cls numeric(6, 3),
  field_lcp_ms integer,
  field_inp_ms integer,
  field_cls numeric(6, 3),
  field_passed boolean,
  field_category text,
  opportunities jsonb not null default '[]'::jsonb,
  error text,
  payload jsonb not null default '{}'::jsonb,
  constraint project_store_speed_pages_kind_check
    check (page_kind in ('home', 'collection', 'product', 'cart'))
);

create index project_store_speed_pages_run_idx
  on public.project_store_speed_pages (run_id);

comment on table public.project_store_speed_runs is
  'A PageSpeed Insights capture for a project store. Origin metrics are CrUX field data.';
comment on table public.project_store_speed_pages is
  'Mobile Lighthouse plus field Core Web Vitals for one storefront URL in a speed run.';

alter table public.project_store_speed_runs enable row level security;
alter table public.project_store_speed_pages enable row level security;

create policy "Members can view store speed runs"
  on public.project_store_speed_runs for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

create policy "Admins can insert store speed runs"
  on public.project_store_speed_runs for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can delete store speed runs"
  on public.project_store_speed_runs for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Members can view store speed pages"
  on public.project_store_speed_pages for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

create policy "Admins can insert store speed pages"
  on public.project_store_speed_pages for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can delete store speed pages"
  on public.project_store_speed_pages for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

grant select, insert, delete on public.project_store_speed_runs to authenticated;
grant select, insert, delete on public.project_store_speed_pages to authenticated;
