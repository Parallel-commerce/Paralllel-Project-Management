"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  ensureClientConversation,
  type ConversationListItem,
} from "@/lib/actions/chat";

export function MessagesInbox({
  conversations,
  title = "Messages",
  emptyCopy,
  projectId,
  startableClients = [],
}: {
  conversations: ConversationListItem[];
  title?: string;
  emptyCopy?: string;
  projectId?: string;
  startableClients?: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

      <ul className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {conversations.length === 0 ? (
          <li className="px-1 py-12 text-center">
            <p className="font-medium">No conversations yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {emptyCopy ??
                "When a client messages the team, it will show up here."}
            </p>
          </li>
        ) : (
          conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/messages/${conversation.id}`}
                className="flex flex-col gap-1 px-1 py-4 hover:bg-[var(--surface)]/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{conversation.client_name}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {conversation.project_name}
                    {conversation.client_email
                      ? ` · ${conversation.client_email}`
                      : ""}
                  </p>
                  {conversation.last_message ? (
                    <p className="mt-1 truncate text-sm text-[var(--muted)]">
                      {conversation.last_message}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      No messages yet
                    </p>
                  )}
                </div>
                {conversation.last_message_at || conversation.updated_at ? (
                  <time className="shrink-0 text-xs text-[var(--muted)]">
                    {new Date(
                      conversation.last_message_at ?? conversation.updated_at,
                    ).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>

      {projectId && clientsToStart.length > 0 ? (
        <div className="mt-8">
          <h2 className="font-medium">Start a conversation</h2>
          <ul className="mt-3 space-y-2">
            {clientsToStart.map((client) => (
              <li
                key={client.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{client.name}</p>
                  <p className="text-xs text-[var(--muted)]">{client.email}</p>
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
                      if ("conversationId" in result && result.conversationId) {
                        router.push(`/messages/${result.conversationId}`);
                      }
                    });
                  }}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  Message
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
