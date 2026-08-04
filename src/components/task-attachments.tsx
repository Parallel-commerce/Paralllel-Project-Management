"use client";

import { useRef, useState, useTransition } from "react";

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
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((file) => file.size > 0);
    if (list.length === 0) return;

    startTransition(async () => {
      setError(null);
      for (const file of list) {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadTaskAttachment(
          projectId,
          listId,
          taskId,
          formData,
        );
        if (result && "error" in result && result.error) {
          setError(result.error);
          break;
        }
        if (result && "attachment" in result && result.attachment) {
          setAttachments((prev) => [...prev, result.attachment]);
        }
      }
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    });
  }

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

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          if (event.dataTransfer.files?.length) {
            uploadFiles(event.dataTransfer.files);
          }
        }}
        className={`mt-3 cursor-pointer rounded-xl border border-dashed px-4 py-6 text-center transition ${
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border)] bg-[var(--surface)]/60 hover:border-[var(--foreground)]/20"
        } ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) {
              uploadFiles(event.target.files);
            }
          }}
        />
        <p className="text-sm font-medium">
          {pending
            ? "Uploading…"
            : dragging
              ? "Drop files to upload"
              : "Drop files here or click to browse"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Images, PDF, Word, Excel, PowerPoint, CSV, ZIP · max 10MB each
        </p>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
    </div>
  );
}
