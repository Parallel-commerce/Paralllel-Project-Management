-- Project chat parity with task comments: replies, image attachments, mentions,
-- and per-message delete. Empty bodies are allowed when a message has images
-- (attachments are inserted after the row, same as task comments).

alter table public.messages
  drop constraint if exists messages_body_check;

alter table public.messages
  add column if not exists parent_id uuid references public.messages (id) on delete set null;

create index if not exists messages_parent_id_idx
  on public.messages (parent_id);

create or replace function public.messages_enforce_parent_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_conversation_id uuid;
  walk_id uuid;
  depth int := 0;
  max_depth constant int := 10;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Message cannot reply to itself';
  end if;

  select m.conversation_id
    into parent_conversation_id
  from public.messages m
  where m.id = new.parent_id;

  if parent_conversation_id is null then
    raise exception 'Parent message not found';
  end if;

  if parent_conversation_id <> new.conversation_id then
    raise exception 'Reply must belong to the same conversation as its parent';
  end if;

  walk_id := new.parent_id;
  while walk_id is not null loop
    depth := depth + 1;
    if depth > max_depth then
      raise exception 'Reply is nested too deeply';
    end if;
    if walk_id = new.id then
      raise exception 'Message reply cycle is not allowed';
    end if;
    select m.parent_id
      into walk_id
    from public.messages m
    where m.id = walk_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists messages_enforce_parent_conversation on public.messages;
create trigger messages_enforce_parent_conversation
  before insert or update of parent_id, conversation_id on public.messages
  for each row execute function public.messages_enforce_parent_conversation();

create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    updated_at = now(),
    last_message_body = left(
      coalesce(nullif(btrim(new.body), ''), 'Sent a photo'),
      500
    ),
    last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create or replace function public.messages_after_delete_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_body text;
  latest_at timestamptz;
begin
  select
    left(coalesce(nullif(btrim(m.body), ''), 'Sent a photo'), 500),
    m.created_at
    into latest_body, latest_at
  from public.messages m
  where m.conversation_id = old.conversation_id
  order by m.created_at desc
  limit 1;

  update public.conversations
  set
    updated_at = now(),
    last_message_body = latest_body,
    last_message_at = latest_at
  where id = old.conversation_id;

  return old;
end;
$$;

drop trigger if exists messages_after_delete_touch_conversation on public.messages;
create trigger messages_after_delete_touch_conversation
  after delete on public.messages
  for each row execute function public.messages_after_delete_touch_conversation();

revoke all on function public.messages_after_delete_touch_conversation() from public, anon, authenticated;

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  content_type text,
  size_bytes integer,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index message_attachments_message_id_idx
  on public.message_attachments (message_id);

create index message_attachments_conversation_id_idx
  on public.message_attachments (conversation_id);

alter table public.message_attachments enable row level security;

create policy "Users can view attachments in accessible conversations"
  on public.message_attachments for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Authors can attach files to own messages"
  on public.message_attachments for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.sender_id = auth.uid()
        and m.conversation_id = message_attachments.conversation_id
        and public.can_send_in_conversation(m.conversation_id)
    )
  );

create policy "Authors and project admins can delete message attachments"
  on public.message_attachments for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.conversations c
      where c.id = message_attachments.conversation_id
        and (
          public.is_project_admin(c.project_id)
          or public.is_platform_admin()
        )
    )
  );

grant select, insert, delete on public.message_attachments to authenticated;

create table public.message_mentions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_mentions_user_id_idx
  on public.message_mentions (user_id);

alter table public.message_mentions enable row level security;

create policy "Users can view mentions in accessible conversations"
  on public.message_mentions for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_mentions.message_id
        and public.can_access_conversation(m.conversation_id)
    )
  );

create policy "Authors can mention project members on own messages"
  on public.message_mentions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      join public.project_members pm
        on pm.project_id = c.project_id
       and pm.user_id = message_mentions.user_id
      where m.id = message_mentions.message_id
        and m.sender_id = auth.uid()
    )
  );

grant select, insert on public.message_mentions to authenticated;

create policy "Authors and project admins can delete messages"
  on public.messages for delete
  to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          public.is_project_admin(c.project_id)
          or public.is_platform_admin()
        )
    )
  );

grant delete on public.messages to authenticated;

alter table public.messages replica identity full;
alter table public.message_attachments replica identity full;

alter publication supabase_realtime add table public.message_attachments;
