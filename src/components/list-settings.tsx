"use client";

import { useState, useTransition } from "react";

import { deleteList, updateList } from "@/lib/actions/projects";
import type { ListVisibility } from "@/types/database";

export function ListSettings({
  projectId,
  listId,
  name,
  visibility,
  canManage,
}: {
  projectId: string;
  listId: string;
  name: string;
  visibility: ListVisibility;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
      >
        List settings
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-80 sm:rounded-xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await updateList(projectId, listId, formData);
                if (result?.error) {
                  setError(result.error);
                } else {
                  setError(null);
                  setOpen(false);
                }
              });
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Name
              <input
                name="name"
                required
                defaultValue={name}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Visibility
              <select
                name="visibility"
                defaultValue={visibility}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
            {error ? (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </form>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this list and all of its tasks? This cannot be undone.",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const result = await deleteList(projectId, listId);
                if (result?.error) {
                  setError(result.error);
                }
              });
            }}
            className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--danger)] hover:bg-red-50 disabled:opacity-60"
          >
            Delete list
          </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
