-- Client–team chat: one conversation per (project, client)

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  client_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_project_client_unique unique (project_id, client_user_id)
);

create index conversations_project_id_updated_at_idx
  on public.conversations (project_id, updated_at desc);

create index conversations_client_user_id_idx
  on public.conversations (client_user_id);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc);

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        public.is_platform_admin()
        or public.is_project_internal(c.project_id)
        or c.client_user_id = auth.uid()
      )
  );
$$;

create or replace function public.can_send_in_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        public.is_platform_admin()
        or public.is_project_internal(c.project_id)
        or c.client_user_id = auth.uid()
      )
  );
$$;

revoke all on function public.can_access_conversation(uuid) from public, anon;
revoke all on function public.can_send_in_conversation(uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid) to authenticated;
grant execute on function public.can_send_in_conversation(uuid) to authenticated;

-- Bump conversation activity on new message
create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

revoke all on function public.messages_touch_conversation() from public, anon, authenticated;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Conversations policies
create policy "Users can view accessible conversations"
  on public.conversations for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_internal(project_id)
    or client_user_id = auth.uid()
  );

create policy "Clients and internal team can create conversations"
  on public.conversations for insert
  to authenticated
  with check (
    -- Client opening their own thread
    (
      client_user_id = auth.uid()
      and public.project_role(project_id) = 'client'
    )
    -- Internal / platform opening a client's thread
    or (
      public.is_project_internal(project_id)
      and exists (
        select 1
        from public.project_members pm
        where pm.project_id = conversations.project_id
          and pm.user_id = conversations.client_user_id
          and pm.role = 'client'
      )
    )
  );

-- No direct updates/deletes from clients; updated_at via trigger
create policy "Internal team can update conversations"
  on public.conversations for update
  to authenticated
  using (public.is_project_internal(project_id))
  with check (public.is_project_internal(project_id));

-- Messages policies
create policy "Users can view messages in accessible conversations"
  on public.messages for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Participants can send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_send_in_conversation(conversation_id)
  );

grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- Realtime for live thread updates
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
