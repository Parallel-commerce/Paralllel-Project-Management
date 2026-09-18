-- Per-project Shopify connection + store health snapshots.
-- Connections (and secrets) are staff-only. Snapshots are visible to all project members.

create type public.shopify_connection_status as enum (
  'pending',
  'connected',
  'error',
  'disconnected'
);

create table public.project_shopify_connections (
  project_id uuid primary key references public.projects (id) on delete cascade,
  shop_domain text not null,
  client_id text not null,
  client_secret_ciphertext text not null,
  access_token_ciphertext text,
  scopes text,
  status public.shopify_connection_status not null default 'pending',
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_shopify_connections_shop_domain_len
    check (char_length(shop_domain) between 4 and 100)
);

create index project_shopify_connections_shop_domain_idx
  on public.project_shopify_connections (shop_domain);

comment on table public.project_shopify_connections is
  'Custom-app credentials and offline token for a project store. Staff only; never expose to clients.';

create trigger project_shopify_connections_set_updated_at
  before update on public.project_shopify_connections
  for each row execute function public.set_updated_at();

create table public.project_store_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  shop_name text,
  shop_domain text,
  primary_domain text,
  plan_name text,
  currency text,
  orders_7d integer,
  sales_7d numeric(14, 2),
  orders_30d integer,
  sales_30d numeric(14, 2),
  sales_available boolean not null default true,
  theme_name text,
  theme_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint project_store_snapshots_orders_7d_nonneg
    check (orders_7d is null or orders_7d >= 0),
  constraint project_store_snapshots_orders_30d_nonneg
    check (orders_30d is null or orders_30d >= 0)
);

create index project_store_snapshots_project_captured_idx
  on public.project_store_snapshots (project_id, captured_at desc);

comment on table public.project_store_snapshots is
  'Point-in-time Shopify store health for a project. Visible to all project members.';

alter table public.project_shopify_connections enable row level security;
alter table public.project_store_snapshots enable row level security;

create policy "Admins can view shopify connections"
  on public.project_shopify_connections for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can insert shopify connections"
  on public.project_shopify_connections for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can update shopify connections"
  on public.project_shopify_connections for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can delete shopify connections"
  on public.project_shopify_connections for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Members can view store snapshots"
  on public.project_store_snapshots for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

create policy "Admins can insert store snapshots"
  on public.project_store_snapshots for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can delete store snapshots"
  on public.project_store_snapshots for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

grant select, insert, update, delete on public.project_shopify_connections to authenticated;
grant select, insert, delete on public.project_store_snapshots to authenticated;
