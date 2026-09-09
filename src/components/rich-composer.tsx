"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  findActiveMention,
  mentionLabel,
  mentionQueryMatches,
  type MentionPerson,
} from "@/lib/mentions";
import {
  COMMENT_IMAGE_MAX_BYTES,
  COMMENT_IMAGE_MAX_FILES,
  isAllowedCommentImage,
} from "@/lib/task-attachments";

type PendingImage = { file: File; previewUrl: string };

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function RichComposer({
  placeholder,
  submitLabel,
  pending,
  members,
  initialBody = "",
  initialMentionIds = [],
  onSubmit,
  onCancel,
  autoFocus,
  submitOnEnter = false,
  hint = "Type @ to mention someone. Paste or attach a screenshot.",
  pendingLabel = "Sending…",
}: {
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  members: MentionPerson[];
  initialBody?: string;
  initialMentionIds?: string[];
  onSubmit: (body: string, mentionedUserIds: string[], files: File[]) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  submitOnEnter?: boolean;
  hint?: string;
  pendingLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef<PendingImage[]>([]);
  const [body, setBody] = useState(initialBody);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialMentionIds);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (mentionStart === null) return [];
    return members
      .filter((person) => mentionQueryMatches(person, mentionQuery))
      .slice(0, 8);
  }, [members, mentionQuery, mentionStart]);

  useEffect(() => {
    setHighlight(0);
  }, [mentionQuery, mentionStart]);

  useEffect(() => {
    return () => {
      pendingImagesRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
    };
  }, []);

  function addFiles(incoming: File[]) {
    const next = [...pendingImagesRef.current];
    let error: string | null = null;
    for (const file of incoming) {
      if (next.length >= COMMENT_IMAGE_MAX_FILES) {
        error = `You can attach up to ${COMMENT_IMAGE_MAX_FILES} images.`;
        break;
      }
      if (!isAllowedCommentImage(file)) {
        error = "Use a JPEG, PNG, WebP, GIF, or HEIC image.";
        continue;
      }
      if (file.size > COMMENT_IMAGE_MAX_BYTES) {
        error = "Each image must be 10MB or smaller.";
        continue;
      }
      if (file.size === 0) continue;
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setFileError(error);
    pendingImagesRef.current = next;
    setPendingImages(next);
  }

  function removePendingImage(index: number) {
    setPendingImages((current) => {
      const item = current[index];
      if (item) URL.revokeObjectURL(item.previewUrl);
      const next = current.filter((_, i) => i !== index);
      pendingImagesRef.current = next;
      return next;
    });
    setFileError(null);
  }

  function clearPendingImages() {
    pendingImagesRef.current.forEach((item) =>
      URL.revokeObjectURL(item.previewUrl),
    );
    pendingImagesRef.current = [];
    setPendingImages([]);
  }

  function updateMentionState(nextBody: string, cursor: number) {
    const active = findActiveMention(nextBody, cursor);
    if (active) {
      setMentionStart(active.start);
      setMentionQuery(active.query);
    } else {
      setMentionStart(null);
      setMentionQuery("");
    }
  }

  function insertMention(person: MentionPerson) {
    const textarea = textareaRef.current;
    if (mentionStart === null || !textarea) return;
    const cursor = textarea.selectionStart ?? body.length;
    const label = mentionLabel(person);
    const before = body.slice(0, mentionStart);
    const after = body.slice(cursor);
    const next = `${before}@${label} ${after}`;
    const caret = before.length + label.length + 2;
    setBody(next);
    setSelectedIds((current) =>
      current.includes(person.id) ? current : [...current, person.id],
    );
    setMentionStart(null);
    setMentionQuery("");
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }

  function resetComposer() {
    setBody("");
    setSelectedIds([]);
    setMentionStart(null);
    setMentionQuery("");
    setFileError(null);
    clearPendingImages();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const pickerOpen = mentionStart !== null && matches.length > 0;
  const canSubmit = Boolean(body.trim() || pendingImages.length > 0);

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = body.trim();
        const files = pendingImages.map((item) => item.file);
        if (!next && files.length === 0) return;
        onSubmit(next, selectedIds, files);
        resetComposer();
      }}
    >
      <div
        className={`relative w-full rounded-md ${
          dragging ? "ring-2 ring-[var(--accent)]" : ""
        }`}
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
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          if (event.dataTransfer.files?.length) {
            addFiles(Array.from(event.dataTransfer.files));
          }
        }}
      >
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => {
            const next = event.target.value;
            setBody(next);
            updateMentionState(next, event.target.selectionStart ?? next.length);
          }}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.files).filter(
              (file) => isAllowedCommentImage(file) && file.size > 0,
            );
            if (images.length > 0) {
              event.preventDefault();
              addFiles(images);
            }
          }}
          onKeyUp={(event) => {
            if (
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "Home" ||
              event.key === "End"
            ) {
              const target = event.currentTarget;
              updateMentionState(target.value, target.selectionStart ?? 0);
            }
          }}
          onClick={(event) => {
            const target = event.currentTarget;
            updateMentionState(target.value, target.selectionStart ?? 0);
          }}
          onKeyDown={(event) => {
            if (pickerOpen) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((current) =>
                  current + 1 >= matches.length ? 0 : current + 1,
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((current) =>
                  current - 1 < 0 ? matches.length - 1 : current - 1,
                );
              } else if (event.key === "Enter" || event.key === "Tab") {
                const person = matches[highlight];
                if (person) {
                  event.preventDefault();
                  insertMention(person);
                }
              } else if (event.key === "Escape") {
                event.preventDefault();
                setMentionStart(null);
                setMentionQuery("");
              }
              return;
            }
            if (
              submitOnEnter &&
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={onCancel ? 2 : 3}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
        {pickerOpen ? (
          <ul
            className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
            role="listbox"
            aria-label="Mention someone"
          >
            {matches.map((person, index) => (
              <li key={person.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => insertMention(person)}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                    index === highlight
                      ? "bg-[var(--accent-soft)]"
                      : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span className="font-medium">{mentionLabel(person)}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {person.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {pendingImages.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {pendingImages.map((item, index) => (
            <li
              key={`${item.file.name}-${item.previewUrl}`}
              className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--border)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt={item.file.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePendingImage(index)}
                className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white"
                aria-label={`Remove ${item.file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-[var(--muted)]">{hint}</p>
      {fileError ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {fileError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          <PaperclipIcon className="h-4 w-4" />
          Attach image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) {
              addFiles(Array.from(event.target.files));
              event.target.value = "";
            }
          }}
        />
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
