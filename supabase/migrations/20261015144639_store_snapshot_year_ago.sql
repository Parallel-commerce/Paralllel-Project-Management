-- Same-window figures from one year earlier, for store dashboard year-on-year.

alter table public.project_store_snapshots
  add column orders_1d_prev_year integer,
  add column sales_1d_prev_year numeric(14, 2),
  add column sessions_1d_prev_year integer,
  add column conversion_rate_1d_prev_year numeric(6, 3),
  add column orders_7d_prev_year integer,
  add column sales_7d_prev_year numeric(14, 2),
  add column sessions_7d_prev_year integer,
  add column conversion_rate_7d_prev_year numeric(6, 3),
  add column orders_30d_prev_year integer,
  add column sales_30d_prev_year numeric(14, 2),
  add column sessions_30d_prev_year integer,
  add column conversion_rate_30d_prev_year numeric(6, 3),
  add constraint project_store_snapshots_orders_1d_prev_year_nonneg
    check (orders_1d_prev_year is null or orders_1d_prev_year >= 0),
  add constraint project_store_snapshots_sessions_1d_prev_year_nonneg
    check (sessions_1d_prev_year is null or sessions_1d_prev_year >= 0),
  add constraint project_store_snapshots_conversion_rate_1d_prev_year_nonneg
    check (conversion_rate_1d_prev_year is null or conversion_rate_1d_prev_year >= 0),
  add constraint project_store_snapshots_orders_7d_prev_year_nonneg
    check (orders_7d_prev_year is null or orders_7d_prev_year >= 0),
  add constraint project_store_snapshots_sessions_7d_prev_year_nonneg
    check (sessions_7d_prev_year is null or sessions_7d_prev_year >= 0),
  add constraint project_store_snapshots_conversion_rate_7d_prev_year_nonneg
    check (conversion_rate_7d_prev_year is null or conversion_rate_7d_prev_year >= 0),
  add constraint project_store_snapshots_orders_30d_prev_year_nonneg
    check (orders_30d_prev_year is null or orders_30d_prev_year >= 0),
  add constraint project_store_snapshots_sessions_30d_prev_year_nonneg
    check (sessions_30d_prev_year is null or sessions_30d_prev_year >= 0),
  add constraint project_store_snapshots_conversion_rate_30d_prev_year_nonneg
    check (conversion_rate_30d_prev_year is null or conversion_rate_30d_prev_year >= 0);

comment on column public.project_store_snapshots.orders_1d_prev_year is
  'Online Store orders for the same completed shop-local day one year earlier.';
comment on column public.project_store_snapshots.sales_1d_prev_year is
  'Online Store sales for the same completed shop-local day one year earlier.';
comment on column public.project_store_snapshots.orders_7d_prev_year is
  'Online Store orders for the same rolling 7-day window one year earlier.';
comment on column public.project_store_snapshots.sales_7d_prev_year is
  'Online Store sales for the same rolling 7-day window one year earlier.';
comment on column public.project_store_snapshots.orders_30d_prev_year is
  'Online Store orders for the same rolling 30-day window one year earlier.';
comment on column public.project_store_snapshots.sales_30d_prev_year is
  'Online Store sales for the same rolling 30-day window one year earlier.';
comment on column public.project_store_snapshots.sessions_1d_prev_year is
  'Sessions for the same completed shop-local day one year earlier.';
comment on column public.project_store_snapshots.sessions_7d_prev_year is
  'Sessions for the same last-7-days window one year earlier.';
comment on column public.project_store_snapshots.sessions_30d_prev_year is
  'Sessions for the same last-30-days window one year earlier.';
comment on column public.project_store_snapshots.conversion_rate_1d_prev_year is
  'Session conversion rate (percent) for the same completed day one year earlier.';
comment on column public.project_store_snapshots.conversion_rate_7d_prev_year is
  'Session conversion rate (percent) for the same last-7-days window one year earlier.';
comment on column public.project_store_snapshots.conversion_rate_30d_prev_year is
  'Session conversion rate (percent) for the same last-30-days window one year earlier.';
