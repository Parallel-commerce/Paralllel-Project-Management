-- Allow dense drag-order ranks beyond the old 0–100 importance presets.
alter table public.tasks drop constraint if exists tasks_importance_range;
alter table public.tasks
  add constraint tasks_importance_range check (importance >= 0);
