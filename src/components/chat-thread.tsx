"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { AttachmentGallery } from "@/components/attachment-gallery";
import { MentionText } from "@/components/mention-text";
import { PersonAvatar } from "@/components/person-avatar";
import { RichComposer } from "@/components/rich-composer";
import {
  deleteMessage,
  sendMessage,
  type ChatMessage,
} from "@/lib/actions/chat";
import { commentMediaPreview } from "@/lib/task-attachments";
import { formatShortDateTime } from "@/lib/format-date";
import { personDisplayName } from "@/lib/person";
import { profileAvatarPublicUrl } from "@/lib/profile-avatar";
import type { MentionPerson } from "@/lib/mentions";
import { createClient } from "@/lib/supabase/client";
import type { MessageAttachment } from "@/types/database";

function upsertMessage(prev: ChatMessage[], next: ChatMessage): ChatMessage[] {
  const existing = prev.find((message) => message.id === next.id);
  if (!existing) return [...prev, next];
  return prev.map((message) => {
    if (message.id !== next.id) return message;
    return {
      ...message,
      ...next,
      attachments:
        next.attachments.length > 0 ? next.attachments : message.attachments,
      sender_name:
        next.sender_name && next.sender_name !== "Someone"
          ? next.sender_name
          : message.sender_name || next.sender_name || "Someone",
      sender_avatar_url:
        next.sender_avatar_url ?? message.sender_avatar_url,
    };
  });
}

export function ChatThread({
  conversationId,
  currentUserId,
  initialMessages,
  members,
  heading,
  subheading,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
  members: MentionPerson[];
  heading: string;
  subheading?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const mentionable = useMemo(
    () => members.filter((member) => !member.deleted_at),
    [members],
  );

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);

  const replyTo = replyToId ? (messagesById.get(replyToId) ?? null) : null;

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            parent_id: string | null;
            body: string;
            created_at: string;
          };

          setMessages((prev) =>
            upsertMessage(prev, {
              id: row.id,
              conversation_id: row.conversation_id,
              sender_id: row.sender_id,
              parent_id: row.parent_id ?? null,
              body: row.body ?? "",
              created_at: row.created_at,
              sender_name:
                row.sender_id === currentUserId ? "" : "Someone",
              sender_avatar_url: null,
              attachments: [],
            }),
          );

          if (row.sender_id !== currentUserId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, email, deleted_at, avatar_path, updated_at")
              .eq("id", row.sender_id)
              .maybeSingle();

            const name = personDisplayName(profile, "Someone");
            const baseUrl = profile?.deleted_at
              ? null
              : profileAvatarPublicUrl(profile?.avatar_path);
            const avatarUrl = baseUrl
              ? `${baseUrl}?v=${encodeURIComponent(profile?.updated_at ?? "")}`
              : null;

            setMessages((prev) =>
              prev.map((message) =>
                message.id === row.id
                  ? {
                      ...message,
                      sender_name: name,
                      sender_avatar_url: avatarUrl,
                    }
                  : message,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row.id) return;
          setMessages((prev) =>
            prev
              .filter((message) => message.id !== row.id)
              .map((message) =>
                message.parent_id === row.id
                  ? { ...message, parent_id: null }
                  : message,
              ),
          );
          setReplyToId((current) => (current === row.id ? null : current));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_attachments",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageAttachment;
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== row.message_id) return message;
              if (message.attachments.some((file) => file.id === row.id)) {
                return message;
              }
              return {
                ...message,
                attachments: [...message.attachments, row],
              };
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  function postMessage(
    body: string,
    mentionedUserIds: string[],
    files: File[],
  ) {
    const parentId = replyToId;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(
        conversationId,
        body,
        parentId,
        mentionedUserIds,
        files,
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result.message) {
        setMessages((prev) => upsertMessage(prev, result.message));
      }
      setReplyToId(null);
    });
  }

  function removeMessage(messageId: string) {
    startTransition(async () => {
      const result = await deleteMessage(messageId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessages((prev) =>
        prev
          .filter((message) => message.id !== messageId)
          .map((message) =>
            message.parent_id === messageId
              ? { ...message, parent_id: null }
              : message,
          ),
      );
      if (replyToId === messageId) setReplyToId(null);
    });
  }

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
          {heading}
        </h1>
        {subheading ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{subheading}</p>
        ) : null}
      </div>

      <div className="mt-6 flex-1 space-y-3 overflow-y-auto border-y border-[var(--border)] py-4">
        {messages.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-[var(--muted)]">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            const parent = message.parent_id
              ? (messagesById.get(message.parent_id) ?? null)
              : null;
            return (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${
                  mine ? "justify-end" : "justify-start"
                }`}
              >
                {!mine ? (
                  <PersonAvatar
                    name={message.sender_name}
                    avatarUrl={message.sender_avatar_url}
                    size={28}
                  />
                ) : null}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%] ${
                    mine
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] border border-[var(--border)]"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">
                      {message.sender_name}
                    </p>
                  ) : null}
                  {parent ? (
                    <div
                      className={`mb-2 border-l-2 pl-2 text-[11px] ${
                        mine
                          ? "border-white/40 text-white/80"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                    >
                      <p className="font-medium">{parent.sender_name}</p>
                      <p className="truncate">
                        {commentMediaPreview(
                          parent.body,
                          parent.attachments.length,
                        ) || "Message"}
                      </p>
                    </div>
                  ) : message.parent_id ? (
                    <p
                      className={`mb-2 text-[11px] italic ${
                        mine ? "text-white/70" : "text-[var(--muted)]"
                      }`}
                    >
                      Original message deleted
                    </p>
                  ) : null}
                  {message.body.trim() ? (
                    <MentionText
                      body={message.body}
                      people={mentionable}
                      className="whitespace-pre-wrap break-words"
                      mentionClassName={
                        mine
                          ? "font-semibold text-white"
                          : "font-medium text-[var(--accent)]"
                      }
                    />
                  ) : null}
                  <AttachmentGallery attachments={message.attachments} />
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p
                      className={`text-[10px] ${
                        mine ? "text-white/70" : "text-[var(--muted)]"
                      }`}
                    >
                      {formatShortDateTime(message.created_at)}
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setReplyToId((current) =>
                          current === message.id ? null : message.id,
                        )
                      }
                      className={`text-[10px] font-medium hover:underline disabled:opacity-60 ${
                        mine ? "text-white/80" : "text-[var(--accent)]"
                      }`}
                    >
                      Reply
                    </button>
                    {mine ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeMessage(message.id)}
                        className="text-[10px] text-white/80 hover:underline disabled:opacity-60"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
                {mine ? (
                  <PersonAvatar
                    name={message.sender_name}
                    avatarUrl={message.sender_avatar_url}
                    size={28}
                  />
                ) : null}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4">
        {replyTo ? (
          <div className="mb-2 flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">
                Replying to {replyTo.sender_name}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {commentMediaPreview(
                  replyTo.body,
                  replyTo.attachments.length,
                ) || "Message"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyToId(null)}
              className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
          </div>
        ) : null}
        <RichComposer
          key={replyToId ?? "new"}
          placeholder={
            replyTo
              ? `Reply to ${replyTo.sender_name}…`
              : "Write a message…"
          }
          submitLabel="Send"
          pending={pending}
          members={mentionable}
          submitOnEnter
          autoFocus={!!replyTo}
          initialBody={
            replyTo && replyTo.sender_id !== currentUserId
              ? `@${replyTo.sender_name} `
              : ""
          }
          initialMentionIds={
            replyTo && replyTo.sender_id !== currentUserId
              ? [replyTo.sender_id]
              : []
          }
          onSubmit={postMessage}
        />
        {error ? (
          <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
