-- In-app notifications + activity audit trail

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_project_id_created_at_idx
  on public.activity_events (project_id, created_at desc);

alter table public.notifications enable row level security;
alter table public.activity_events enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts happen via security definer helper so actors can notify others
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, text) to authenticated;

create or replace function public.log_activity(
  p_project_id uuid,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not (
    public.is_platform_admin()
    or public.is_project_member(p_project_id)
    or p_actor_id = auth.uid()
  ) then
    raise exception 'Not allowed to log activity for this project';
  end if;

  insert into public.activity_events (
    project_id, actor_id, entity_type, entity_id, action, summary, metadata
  )
  values (
    p_project_id, p_actor_id, p_entity_type, p_entity_id, p_action, p_summary, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.log_activity(uuid, uuid, text, uuid, text, text, jsonb) from public, anon;
grant execute on function public.log_activity(uuid, uuid, text, uuid, text, text, jsonb) to authenticated;

create policy "Members can view project activity"
  on public.activity_events for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_member(project_id)
  );

grant select, update on public.notifications to authenticated;
grant select on public.activity_events to authenticated;
