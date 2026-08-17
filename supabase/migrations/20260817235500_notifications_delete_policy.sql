-- Allow users to permanently clear their own notifications

grant delete on public.notifications to authenticated;

create policy "Users can delete own notifications"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());
