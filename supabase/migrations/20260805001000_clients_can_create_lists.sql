-- Clients can create lists; only admins/members (or project admins) can delete

drop policy if exists "Admins and members can create lists" on public.lists;
create policy "Project members can create lists"
  on public.lists for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "Creators and admins can delete lists" on public.lists;
create policy "Admins and members can delete lists"
  on public.lists for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
    or (
      created_by = auth.uid()
      and public.project_role(project_id) in ('admin', 'member')
    )
  );
