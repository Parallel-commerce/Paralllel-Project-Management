"use client";

import { useState, useTransition } from "react";

import { restoreArchivedTask } from "@/lib/actions/projects";

export function RestoreArchivedTaskButton({
  projectId,
  listId,
  taskId,
}: {
  projectId: string;
  listId: string;
  taskId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await restoreArchivedTask(projectId, listId, taskId);
            if (result?.error) {
              setError(result.error);
            }
          });
        }}
        className="min-h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>
      ) : null}
    </div>
  );
}
