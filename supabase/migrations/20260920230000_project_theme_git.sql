-- GitHub repo for the live Shopify theme (push to this branch = production).

create table public.project_theme_git (
  project_id uuid primary key references public.projects (id) on delete cascade,
  repo text not null,
  branch text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_theme_git_repo_format
    check (repo ~ '^[^/\s]+/[^/\s]+$'),
  constraint project_theme_git_branch_len
    check (char_length(branch) between 1 and 100)
);

comment on table public.project_theme_git is
  'GitHub repository whose configured branch is the live Shopify theme. Members can read; admins write.';
comment on column public.project_theme_git.repo is
  'owner/name, e.g. Parallel-commerce/forty_v2.';
comment on column public.project_theme_git.branch is
  'Published branch. Parallel treats this as production (typically main).';

create trigger project_theme_git_set_updated_at
  before update on public.project_theme_git
  for each row execute function public.set_updated_at();

alter table public.project_theme_git enable row level security;

create policy "Members can view theme git"
  on public.project_theme_git for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

create policy "Admins can insert theme git"
  on public.project_theme_git for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can update theme git"
  on public.project_theme_git for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

create policy "Admins can delete theme git"
  on public.project_theme_git for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

grant select, insert, update, delete on public.project_theme_git to authenticated;
