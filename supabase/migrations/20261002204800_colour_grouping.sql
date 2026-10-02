-- Opt-in colour grouping for stores that list each colour as its own product.
-- A daily job groups titles shaped as "Name (Colour)" on projects that enable it.

alter table public.project_shopify_connections
  add column colour_grouping_enabled boolean not null default false,
  add column colour_grouping_last_run_at timestamptz,
  add column colour_grouping_last_error text,
  add column colour_grouping_last_summary text;

comment on column public.project_shopify_connections.colour_grouping_enabled is
  'When true, the daily job groups products titled "Name (Colour)" into an app-owned metaobject.';
