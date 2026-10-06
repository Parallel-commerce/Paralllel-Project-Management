-- Admin-chosen due dates stay on that day when priority reschedules the list.
alter table public.tasks
  add column if not exists due_date_locked boolean not null default false;

comment on column public.tasks.due_date_locked is
  'True when an admin chose this due date. Priority rescheduling leaves it in place.';
