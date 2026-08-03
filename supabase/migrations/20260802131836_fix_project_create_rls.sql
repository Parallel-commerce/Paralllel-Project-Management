-- Fix project create: creators must be able to read their new project
-- (INSERT ... RETURNING) and ensure membership can be established.

drop policy if exists "Members can view their projects" on public.projects;

create policy "Members and creators can view projects"
  on public.projects for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_project_member(id)
  );

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
