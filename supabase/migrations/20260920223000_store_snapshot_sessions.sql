-- Sessions and conversion on store snapshots (ShopifyQL / read_reports).

alter table public.project_store_snapshots
  add column sessions_1d integer,
  add column conversion_rate_1d numeric(6, 3),
  add column sessions_7d integer,
  add column conversion_rate_7d numeric(6, 3),
  add column sessions_30d integer,
  add column conversion_rate_30d numeric(6, 3),
  add column reports_available boolean,
  add constraint project_store_snapshots_sessions_1d_nonneg
    check (sessions_1d is null or sessions_1d >= 0),
  add constraint project_store_snapshots_sessions_7d_nonneg
    check (sessions_7d is null or sessions_7d >= 0),
  add constraint project_store_snapshots_sessions_30d_nonneg
    check (sessions_30d is null or sessions_30d >= 0),
  add constraint project_store_snapshots_conversion_rate_1d_nonneg
    check (conversion_rate_1d is null or conversion_rate_1d >= 0),
  add constraint project_store_snapshots_conversion_rate_7d_nonneg
    check (conversion_rate_7d is null or conversion_rate_7d >= 0),
  add constraint project_store_snapshots_conversion_rate_30d_nonneg
    check (conversion_rate_30d is null or conversion_rate_30d >= 0);

comment on column public.project_store_snapshots.sessions_1d is
  'Online store sessions for the completed shop-local day.';
comment on column public.project_store_snapshots.conversion_rate_1d is
  'Session conversion rate as a percent (0–100) for the completed shop-local day.';
comment on column public.project_store_snapshots.sessions_7d is
  'Online store sessions for the last 7 days, including today.';
comment on column public.project_store_snapshots.conversion_rate_7d is
  'Session conversion rate as a percent (0–100) for the last 7 days.';
comment on column public.project_store_snapshots.reports_available is
  'False when ShopifyQL sessions/conversion could not be read (usually missing read_reports). Null on older snapshots.';
