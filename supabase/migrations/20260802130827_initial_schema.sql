-- Parallel Project Management: initial schema + RLS

create extension if not exists "pgcrypto";

-- Enums
create type public.project_role as enum ('admin', 'member', 'client');
create type public.list_visibility as enum ('public', 'private');
create type public.task_status as enum ('todo', 'in_progress', 'requiring_feedback', 'done');

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Project membership
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

-- Pending invites (claimed when invitee signs up / logs in)
create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role public.project_role not null default 'client',
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

create index project_invites_email_lower_idx on public.project_invites (lower(email));

-- Lists
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  visibility public.list_visibility not null default 'public',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_project_id_idx on public.lists (project_id);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status public.task_status not null default 'todo',
  created_by uuid not null references public.profiles (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_list_id_idx on public.tasks (list_id);
create index tasks_assigned_to_idx on public.tasks (assigned_to);
create index tasks_status_idx on public.tasks (status);

-- Updated-at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Security-definer helpers (avoid RLS recursion)
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_admin(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
  );
$$;

create or replace function public.project_role(p_project_id uuid)
returns public.project_role
language sql
stable
security definer
set search_path = public
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_view_list(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lists l
    where l.id = p_list_id
      and public.is_project_member(l.project_id)
      and (
        l.visibility = 'public'
        or l.created_by = auth.uid()
        or public.is_project_admin(l.project_id)
      )
  );
$$;

-- Profile bootstrap + invite claiming
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  -- Claim any pending invites for this email
  insert into public.project_members (project_id, user_id, role)
  select pi.project_id, new.id, pi.role
  from public.project_invites pi
  where lower(pi.email) = lower(new.email)
  on conflict do nothing;

  delete from public.project_invites
  where lower(email) = lower(new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Also claim invites for existing users when a new invite is inserted
create or replace function public.claim_invite_if_user_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_user_id uuid;
begin
  select p.id into existing_user_id
  from public.profiles p
  where lower(p.email) = lower(new.email)
  limit 1;

  if existing_user_id is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.project_id, existing_user_id, new.role)
    on conflict do nothing;

    delete from public.project_invites where id = new.id;
    return null;
  end if;

  return new;
end;
$$;

create trigger project_invites_claim_existing
  before insert on public.project_invites
  for each row execute function public.claim_invite_if_user_exists();

-- When a project is created, add creator as admin
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;

-- Profiles policies
create policy "Users can view profiles of shared project members"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.project_members mine
      join public.project_members theirs
        on mine.project_id = theirs.project_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Projects policies
create policy "Members and creators can view projects"
  on public.projects for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_project_member(id)
  );

create policy "Authenticated users can create projects"
  on public.projects for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Admins can update projects"
  on public.projects for update
  to authenticated
  using (public.is_project_admin(id))
  with check (public.is_project_admin(id));

create policy "Admins can delete projects"
  on public.projects for delete
  to authenticated
  using (public.is_project_admin(id));

-- Project members policies
create policy "Members can view project membership"
  on public.project_members for select
  to authenticated
  using (public.is_project_member(project_id));

-- Creator membership is inserted by security definer trigger (bypasses RLS).
create policy "Admins can insert members"
  on public.project_members for insert
  to authenticated
  with check (public.is_project_admin(project_id));

create policy "Creators can add themselves as admin"
  on public.project_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'admin'
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.created_by = auth.uid()
    )
  );

create policy "Admins can update members"
  on public.project_members for update
  to authenticated
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

create policy "Admins can delete members"
  on public.project_members for delete
  to authenticated
  using (public.is_project_admin(project_id));

-- Project invites policies
create policy "Admins can view invites"
  on public.project_invites for select
  to authenticated
  using (public.is_project_admin(project_id));

create policy "Admins can create invites"
  on public.project_invites for insert
  to authenticated
  with check (public.is_project_admin(project_id) and invited_by = auth.uid());

create policy "Admins can delete invites"
  on public.project_invites for delete
  to authenticated
  using (public.is_project_admin(project_id));

-- Lists policies
create policy "Members can view accessible lists"
  on public.lists for select
  to authenticated
  using (
    public.is_project_member(project_id)
    and (
      visibility = 'public'
      or created_by = auth.uid()
      or public.is_project_admin(project_id)
    )
  );

create policy "Admins and members can create lists"
  on public.lists for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_project_member(project_id)
    and public.project_role(project_id) in ('admin', 'member')
  );

create policy "Creators and admins can update lists"
  on public.lists for update
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_project_admin(project_id)
  )
  with check (
    created_by = auth.uid()
    or public.is_project_admin(project_id)
  );

create policy "Creators and admins can delete lists"
  on public.lists for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_project_admin(project_id)
  );

-- Tasks policies
create policy "Users can view tasks on accessible lists"
  on public.tasks for select
  to authenticated
  using (public.can_view_list(list_id));

create policy "Users can create tasks on accessible lists"
  on public.tasks for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.can_view_list(list_id)
  );

create policy "Users can update tasks on accessible lists"
  on public.tasks for update
  to authenticated
  using (public.can_view_list(list_id))
  with check (public.can_view_list(list_id));

create policy "Creators and admins can delete tasks"
  on public.tasks for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.lists l
      where l.id = tasks.list_id
        and public.is_project_admin(l.project_id)
    )
  );

-- Grants
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, delete on public.project_invites to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

-- Trigger-only functions: not callable via API
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_project() from public, anon, authenticated;
revoke all on function public.claim_invite_if_user_exists() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- RLS helpers: authenticated only
revoke all on function public.is_project_member(uuid) from public, anon;
revoke all on function public.is_project_admin(uuid) from public, anon;
revoke all on function public.project_role(uuid) from public, anon;
revoke all on function public.can_view_list(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_admin(uuid) to authenticated;
grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.can_view_list(uuid) to authenticated;
