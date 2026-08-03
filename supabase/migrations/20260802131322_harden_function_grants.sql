-- Harden SECURITY DEFINER function privileges and search_path

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

-- Trigger-only functions: not callable via API
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_project() from public, anon, authenticated;
revoke all on function public.claim_invite_if_user_exists() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- RLS helpers: authenticated only (used inside policies)
revoke all on function public.is_project_member(uuid) from public, anon;
revoke all on function public.is_project_admin(uuid) from public, anon;
revoke all on function public.project_role(uuid) from public, anon;
revoke all on function public.can_view_list(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_admin(uuid) to authenticated;
grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.can_view_list(uuid) to authenticated;
