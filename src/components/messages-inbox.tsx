"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteConversation,
  ensureClientConversation,
  type ConversationListItem,
} from "@/lib/actions/chat";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export function MessagesInbox({
  conversations,
  title = "Messages",
  emptyCopy,
  projectId,
  startableClients = [],
  canDelete = false,
}: {
  conversations: ConversationListItem[];
  title?: string;
  emptyCopy?: string;
  projectId?: string;
  startableClients?: { id: string; name: string; email: string }[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openIds = new Set(conversations.map((c) => c.client_user_id));
  const clientsToStart = startableClients.filter((c) => !openIds.has(c.id));

  return (
    <div>
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Private threads between each client and the project team.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 space-y-2">
        {conversations.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-4 py-10 text-center">
            <p className="font-medium">No conversations yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {emptyCopy ??
                "When a client messages the team, it will show up here."}
            </p>
          </li>
        ) : (
          conversations.map((conversation) => {
            const when =
              conversation.last_message_at ?? conversation.updated_at;
            return (
              <li key={conversation.id}>
                <div className="flex items-stretch overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--foreground)]/15 hover:bg-white">
                  <Link
                    href={`/messages/${conversation.id}`}
                    className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-3.5 sm:py-3.5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-sm text-[var(--accent)]">
                      {initials(conversation.client_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium tracking-tight">
                          {conversation.client_name}
                        </p>
                        {when ? (
                          <time className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                            {formatWhen(when)}
                          </time>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {conversation.project_name}
                        {conversation.client_email
                          ? ` · ${conversation.client_email}`
                          : ""}
                      </p>
                      <p className="mt-1 truncate text-sm text-[var(--muted)]">
                        {conversation.last_message ?? "No messages yet"}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="hidden shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)] sm:inline"
                    >
                      →
                    </span>
                  </Link>
                  {canDelete ? (
                    <div className="flex shrink-0 items-center border-l border-[var(--border)] px-1.5 sm:px-2">
                      <button
                        type="button"
                        disabled={pending && deletingId === conversation.id}
                        aria-label={`Delete conversation with ${conversation.client_name}`}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete the conversation with ${conversation.client_name}? All messages in this thread will be removed.`,
                            )
                          ) {
                            return;
                          }
                          setError(null);
                          setDeletingId(conversation.id);
                          startTransition(async () => {
                            const result = await deleteConversation(
                              conversation.id,
                            );
                            setDeletingId(null);
                            if (result.error) {
                              setError(result.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                        className="rounded-md px-2.5 py-2 text-xs text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        {pending && deletingId === conversation.id
                          ? "…"
                          : "Delete"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>

      {projectId && clientsToStart.length > 0 ? (
        <div className="mt-8">
          <h2 className="font-medium">Start a conversation</h2>
          <ul className="mt-3 space-y-2">
            {clientsToStart.map((client) => (
              <li key={client.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--column)]/70 px-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] font-display text-sm text-[var(--accent)]">
                      {initials(client.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {client.name}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {client.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await ensureClientConversation(
                          projectId,
                          client.id,
                        );
                        if ("error" in result && result.error) {
                          setError(result.error);
                          return;
                        }
                        if (
                          "conversationId" in result &&
                          result.conversationId
                        ) {
                          router.push(`/messages/${result.conversationId}`);
                        }
                      });
                    }}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm transition hover:border-[var(--foreground)]/15 hover:bg-white disabled:opacity-50"
                  >
                    Message
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
