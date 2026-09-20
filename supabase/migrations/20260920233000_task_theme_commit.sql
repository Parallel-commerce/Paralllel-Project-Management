-- Snapshot of the live theme git commit that shipped a task.

alter table public.tasks
  add column if not exists theme_commit_sha text,
  add column if not exists theme_commit_message text,
  add column if not exists theme_commit_url text,
  add column if not exists theme_committed_at timestamptz,
  add column if not exists theme_commit_none boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_theme_commit_sha_format;

alter table public.tasks
  add constraint tasks_theme_commit_sha_format
  check (theme_commit_sha is null or theme_commit_sha ~ '^[0-9a-f]{40}$');

alter table public.tasks
  drop constraint if exists tasks_theme_commit_choice;

alter table public.tasks
  add constraint tasks_theme_commit_choice
  check (not theme_commit_none or theme_commit_sha is null);

comment on column public.tasks.theme_commit_sha is
  'Full git SHA of the live theme deploy that shipped this task.';
comment on column public.tasks.theme_commit_message is
  'First-line commit message snapshot so reports do not depend on GitHub.';
comment on column public.tasks.theme_commit_none is
  'True when the task was completed with no theme deploy (non-code work).';

create index if not exists tasks_theme_commit_sha_idx
  on public.tasks (project_id, theme_commit_sha)
  where theme_commit_sha is not null;
