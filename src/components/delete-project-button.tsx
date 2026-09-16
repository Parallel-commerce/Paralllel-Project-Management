"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteProjectInPlace } from "@/lib/actions/projects";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete project ${projectName}`}
        onClick={() => {
          if (
            !window.confirm(
              `Delete project “${projectName}”? This permanently removes the project, lists, tasks, files, messages, and reports.`,
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await deleteProjectInPlace(projectId);
            if (result?.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="whitespace-nowrap rounded-md px-2 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--accent-soft)] disabled:opacity-60 sm:px-2.5 sm:text-sm"
      >
        {pending ? "Deleting…" : "Delete project"}
      </button>
      {error ? (
        <p className="mt-1 max-w-[10rem] text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
