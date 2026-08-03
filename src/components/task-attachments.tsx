"use client";

import { useState, useTransition } from "react";

import {
  deleteTaskAttachment,
  uploadTaskAttachment,
} from "@/lib/actions/projects";
import { taskAttachmentPublicUrl } from "@/lib/task-attachments";
import type { TaskAttachment } from "@/types/database";

export function TaskAttachments({
  projectId,
  listId,
  taskId,
  attachments: initial,
}: {
  projectId: string;
  listId: string;
  taskId: string;
  attachments: TaskAttachment[];
}) {
  const [attachments, setAttachments] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6 border-t border-[var(--border)] pt-4">
      <h3 className="text-sm font-medium">Attachments</h3>
      <ul className="mt-3 space-y-2">
        {attachments.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">No files yet.</li>
        ) : (
          attachments.map((file) => {
            const url = taskAttachmentPublicUrl(file.file_path);
            return (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[var(--accent)] hover:underline"
                  >
                    {file.file_name}
                  </a>
                ) : (
                  <span className="truncate">{file.file_name}</span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await deleteTaskAttachment(
                        projectId,
                        listId,
                        file.id,
                      );
                      if (result && "error" in result) {
                        setError(result.error ?? "Could not remove file.");
                      } else {
                        setAttachments((prev) =>
                          prev.filter((item) => item.id !== file.id),
                        );
                        setError(null);
                      }
                    });
                  }}
                  className="shrink-0 text-xs text-[var(--danger)] hover:underline disabled:opacity-60"
                >
                  Remove
                </button>
              </li>
            );
          })
        )}
      </ul>

      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          startTransition(async () => {
            const result = await uploadTaskAttachment(
              projectId,
              listId,
              taskId,
              formData,
            );
            if (result && "error" in result) {
              setError(result.error ?? "Upload failed.");
            } else if (result && "attachment" in result && result.attachment) {
              setAttachments((prev) => [...prev, result.attachment]);
              setError(null);
              form.reset();
            }
          });
        }}
      >
        <input
          name="file"
          type="file"
          required
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload file"}
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--muted)]">
        Images, PDF, or docs · max 10MB
      </p>
    </div>
  );
}
