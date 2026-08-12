-- Allow internal team / platform admins to delete client conversations.
-- Messages cascade via conversations_id FK on delete.

create policy "Internal team can delete conversations"
  on public.conversations for delete
  to authenticated
  using (public.is_project_internal(project_id));

grant delete on public.conversations to authenticated;
