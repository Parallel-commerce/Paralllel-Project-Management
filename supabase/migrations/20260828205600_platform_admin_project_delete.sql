-- Let platform admins update and delete projects they are not members of.

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
  on public.projects for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_admin(id)
  );

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
  on public.projects for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(id)
  );
