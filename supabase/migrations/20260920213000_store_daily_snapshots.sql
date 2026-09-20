-- Daily completed-day metrics for store snapshots.
-- Scheduled jobs insert one row per shop-local date; manual syncs stay extra.

alter table public.project_store_snapshots
  add column orders_1d integer,
  add column sales_1d numeric(14, 2),
  add column snapshot_date date,
  add column source text not null default 'manual',
  add constraint project_store_snapshots_orders_1d_nonneg
    check (orders_1d is null or orders_1d >= 0),
  add constraint project_store_snapshots_source_check
    check (source in ('manual', 'scheduled'));

create unique index project_store_snapshots_scheduled_date_uidx
  on public.project_store_snapshots (project_id, snapshot_date)
  where source = 'scheduled' and snapshot_date is not null;

comment on column public.project_store_snapshots.snapshot_date is
  'Shop-local calendar date for the completed day in orders_1d / sales_1d.';
comment on column public.project_store_snapshots.source is
  'manual = Sync now; scheduled = nightly job after local midnight.';
