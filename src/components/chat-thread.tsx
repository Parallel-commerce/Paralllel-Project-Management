"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { sendMessage } from "@/lib/actions/chat";
import { createClient } from "@/lib/supabase/client";

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string;
};

export function ChatThread({
  conversationId,
  currentUserId,
  initialMessages,
  heading,
  subheading,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
  heading: string;
  subheading?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
            body: string;
            created_at: string;
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                conversation_id: row.conversation_id,
                sender_id: row.sender_id,
                body: row.body,
                created_at: row.created_at,
                sender_name:
                  row.sender_id === currentUserId ? "You" : "Someone",
              },
            ];
          });

          if (row.sender_id !== currentUserId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", row.sender_id)
              .maybeSingle();

            const name =
              profile?.full_name || profile?.email || "Someone";

            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.id ? { ...m, sender_name: name } : m,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

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
            return (
              <div
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%] ${
                    mine
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] border border-[var(--border)]"
                  }`}
                >
                  {!mine ? (
                    <p
                      className={`mb-1 text-[11px] font-medium ${
                        mine ? "text-white/80" : "text-[var(--muted)]"
                      }`}
                    >
                      {message.sender_name}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words">
                    {message.body}
                  </p>
                  <p
                    className={`mt-1 text-[10px] ${
                      mine ? "text-white/70" : "text-[var(--muted)]"
                    }`}
                  >
                    {new Date(message.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setError(null);
          setDraft("");
          startTransition(async () => {
            const result = await sendMessage(conversationId, text);
            if (result?.error) {
              setError(result.error);
              setDraft(text);
            }
          });
        }}
      >
        <label className="sr-only" htmlFor="chat-message">
          Message
        </label>
        <textarea
          id="chat-message"
          rows={2}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message…"
          className="min-h-[2.75rem] flex-1 resize-y rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
