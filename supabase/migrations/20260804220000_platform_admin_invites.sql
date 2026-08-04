-- Allow platform admins to invite and add members on any project

drop policy if exists "Admins can insert members" on public.project_members;
create policy "Admins can insert members"
  on public.project_members for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

drop policy if exists "Admins can view invites" on public.project_invites;
create policy "Admins can view invites"
  on public.project_invites for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );

drop policy if exists "Admins can create invites" on public.project_invites;
create policy "Admins can create invites"
  on public.project_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and (
      public.is_platform_admin()
      or public.is_project_admin(project_id)
    )
  );

drop policy if exists "Admins can delete invites" on public.project_invites;
create policy "Admins can delete invites"
  on public.project_invites for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_admin(project_id)
  );
