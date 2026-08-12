"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteConversation } from "@/lib/actions/chat";

export function DeleteConversationButton({
  conversationId,
  clientName,
  redirectTo,
}: {
  conversationId: string;
  clientName: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Delete the conversation with ${clientName}? All messages in this thread will be removed.`,
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await deleteConversation(conversationId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.replace(redirectTo);
            router.refresh();
          });
        }}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--danger)]/30 hover:bg-[var(--accent-soft)] hover:text-[var(--danger)] disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete conversation"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
