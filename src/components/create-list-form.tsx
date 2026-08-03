"use client";

import { useState, useTransition } from "react";

import { createList } from "@/lib/actions/projects";

export function CreateListForm({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canCreate) {
    return null;
  }

  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createList(projectId, formData);
          if (result?.error) {
            setError(result.error);
          }
        });
      }}
    >
      <label className="flex flex-1 flex-col gap-1.5 text-sm text-[var(--muted)]">
        New list
        <input
          name="name"
          required
          placeholder="Sprint board"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Visibility
        <select
          name="visibility"
          defaultValue="public"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        >
          <option value="public">Public (everyone on project)</option>
          <option value="private">Private (you + admins)</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create list"}
      </button>
      {error ? (
        <p className="basis-full text-sm text-[var(--danger)]">{error}</p>
      ) : null}
    </form>
  );
}
