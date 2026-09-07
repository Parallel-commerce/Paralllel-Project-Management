"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  createTaskComment,
  deleteTaskComment,
  listTaskComments,
  type CommentWithAuthor,
} from "@/lib/actions/comments";
import {
  findActiveMention,
  mentionLabel,
  mentionQueryMatches,
  tokenizeMentions,
  type MentionPerson,
} from "@/lib/mentions";
import { personDisplayName } from "@/lib/person";
import { formatDateTime } from "@/lib/format-date";
import {
  COMMENT_IMAGE_MAX_BYTES,
  COMMENT_IMAGE_MAX_FILES,
  isAllowedCommentImage,
  isPreviewableImage,
  taskAttachmentPublicUrl,
} from "@/lib/task-attachments";

const MAX_VISIBLE_INDENT = 5;

type CommentNode = CommentWithAuthor & { children: CommentNode[] };

function authorLabel(comment: CommentWithAuthor) {
  return personDisplayName(comment.author, "Unknown");
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function buildCommentTree(comments: CommentWithAuthor[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const comment of comments) {
    byId.set(comment.id, { ...comment, children: [] });
  }

  const roots: CommentNode[] = [];
  for (const comment of comments) {
    const node = byId.get(comment.id);
    if (!node) continue;
    const parent = comment.parent_id ? byId.get(comment.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function AuthorAvatar({ comment }: { comment: CommentWithAuthor }) {
  const label = authorLabel(comment);
  const avatarUrl = comment.author?.avatar_url;

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] object-cover"
        unoptimized
      />
    );
  }

  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-medium text-[var(--muted)]"
      aria-hidden
    >
      {initialsFromName(label)}
    </span>
  );
}

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

function CommentImages({
  attachments,
}: {
  attachments: CommentWithAuthor["attachments"];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = attachments.find((file) => file.id === openId) ?? null;
  const openUrl = open ? taskAttachmentPublicUrl(open.file_path) : null;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (attachments.length === 0) return null;

  return (
    <>
      <ul
        className={`mt-2 grid gap-2 ${
          attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {attachments.map((file) => {
          const url = taskAttachmentPublicUrl(file.file_path);
          const preview = isPreviewableImage(file.content_type);
          return (
            <li key={file.id}>
              {url && preview ? (
                <button
                  type="button"
                  onClick={() => setOpenId(file.id)}
                  className="block w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={file.file_name}
                    className="max-h-64 w-full object-cover"
                  />
                </button>
              ) : url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--accent)] hover:underline"
                >
                  {file.file_name}
                </a>
              ) : (
                <span className="block truncate text-sm">{file.file_name}</span>
              )}
            </li>
          );
        })}
      </ul>
      {open && openUrl
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/70"
                aria-label="Close image"
                onClick={() => setOpenId(null)}
              />
              <figure className="relative z-10 max-h-[90vh] max-w-[min(96vw,56rem)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={openUrl}
                  alt={open.file_name}
                  className="max-h-[90vh] w-auto max-w-full rounded-lg object-contain"
                />
                <figcaption className="mt-2 text-center text-xs text-white/80">
                  <a
                    href={openUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {open.file_name}
                  </a>
                </figcaption>
              </figure>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CommentBody({
  body,
  people,
}: {
  body: string;
  people: MentionPerson[];
}) {
  const tokens = tokenizeMentions(body, people);

  return (
    <p className="mt-2 whitespace-pre-wrap text-sm">
      {tokens.map((token, index) =>
        token.type === "mention" ? (
          <span key={index} className="font-medium text-[var(--accent)]">
            {token.value}
          </span>
        ) : (
          <span key={index}>{token.value}</span>
        ),
      )}
    </p>
  );
}

type PendingImage = { file: File; previewUrl: string };

function CommentComposer({
  placeholder,
  submitLabel,
  pending,
  members,
  initialBody = "",
  initialMentionIds = [],
  onSubmit,
  onCancel,
  autoFocus,
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
        setBody("");
        setSelectedIds([]);
        setMentionStart(null);
        setMentionQuery("");
        setFileError(null);
        clearPendingImages();
        if (fileInputRef.current) fileInputRef.current.value = "";
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
            if (!pickerOpen) return;
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
      <p className="text-xs text-[var(--muted)]">
        Type @ to mention someone. Paste or attach a screenshot.
      </p>
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
          {pending ? "Posting…" : submitLabel}
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

function CommentItem({
  comment,
  members,
  currentUserId,
  pending,
  replyOpen,
  onReply,
  onCloseReply,
  onSubmitReply,
  onDelete,
}: {
  comment: CommentWithAuthor;
  members: MentionPerson[];
  currentUserId: string;
  pending: boolean;
  replyOpen?: boolean;
  onReply?: () => void;
  onCloseReply?: () => void;
  onSubmitReply?: (
    body: string,
    mentionedUserIds: string[],
    files: File[],
  ) => void;
  onDelete: () => void;
}) {
  return (
    <article>
      <div className="flex gap-3">
        <AuthorAvatar comment={comment} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {authorLabel(comment)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {formatDateTime(comment.created_at)}
              </p>
            </div>
            {comment.created_by === currentUserId ? (
              <button
                type="button"
                disabled={pending}
                onClick={onDelete}
                className="shrink-0 text-xs text-[var(--danger)] hover:underline disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
          </div>
          {comment.body.trim() ? (
            <CommentBody body={comment.body} people={members} />
          ) : null}
          <CommentImages attachments={comment.attachments ?? []} />
          {onReply ? (
            <button
              type="button"
              onClick={onReply}
              className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Reply
            </button>
          ) : null}
          {replyOpen && onSubmitReply && onCloseReply ? (
            <div className="mt-3">
              <CommentComposer
                placeholder={`Reply to ${authorLabel(comment)}…`}
                submitLabel="Post reply"
                pending={pending}
                members={members}
                autoFocus
                initialBody={
                  comment.author && !comment.author.deleted_at
                    ? `@${authorLabel(comment)} `
                    : ""
                }
                initialMentionIds={
                  comment.author && !comment.author.deleted_at
                    ? [comment.created_by]
                    : []
                }
                onSubmit={onSubmitReply}
                onCancel={onCloseReply}
              />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CommentThread({
  node,
  depth,
  members,
  currentUserId,
  pending,
  replyingTo,
  onToggleReply,
  onCloseReply,
  onSubmitReply,
  onDelete,
}: {
  node: CommentNode;
  depth: number;
  members: MentionPerson[];
  currentUserId: string;
  pending: boolean;
  replyingTo: string | null;
  onToggleReply: (commentId: string) => void;
  onCloseReply: () => void;
  onSubmitReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[],
    files: File[],
  ) => void;
  onDelete: (commentId: string) => void;
}) {
  return (
    <div
      className={
        depth === 0
          ? "rounded-lg border border-[var(--border)] bg-[var(--background)]/60 px-3 py-3"
          : depth >= MAX_VISIBLE_INDENT
            ? "mt-3"
            : "mt-3 border-l-2 border-[var(--border)] pl-3 sm:pl-4"
      }
    >
      <CommentItem
        comment={node}
        members={members}
        currentUserId={currentUserId}
        pending={pending}
        replyOpen={replyingTo === node.id}
        onReply={() => onToggleReply(node.id)}
        onCloseReply={onCloseReply}
        onSubmitReply={(body, mentionedUserIds, files) =>
          onSubmitReply(node.id, body, mentionedUserIds, files)
        }
        onDelete={() => onDelete(node.id)}
      />
      {node.children.map((child) => (
        <CommentThread
          key={child.id}
          node={child}
          depth={depth + 1}
          members={members}
          currentUserId={currentUserId}
          pending={pending}
          replyingTo={replyingTo}
          onToggleReply={onToggleReply}
          onCloseReply={onCloseReply}
          onSubmitReply={onSubmitReply}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export function TaskComments({
  projectId,
  listId,
  taskId,
  currentUserId,
  members,
  initialReplyToId = null,
  onClose,
  onCountChange,
}: {
  projectId: string;
  listId: string;
  taskId: string;
  currentUserId: string;
  members: MentionPerson[];
  initialReplyToId?: string | null;
  onClose?: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(
    initialReplyToId,
  );
  const [pending, startTransition] = useTransition();

  const mentionable = useMemo(
    () => members.filter((member) => !member.deleted_at),
    [members],
  );

  function refresh() {
    startTransition(async () => {
      const result = await listTaskComments(taskId);
      if (result.error) {
        setError(result.error);
      } else {
        setComments(result.comments);
        setError(null);
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTaskComments(taskId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setReplyingTo(null);
      } else {
        setComments(result.comments);
        setReplyingTo(
          initialReplyToId &&
            result.comments.some((comment) => comment.id === initialReplyToId)
            ? initialReplyToId
            : null,
        );
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, initialReplyToId]);

  useEffect(() => {
    if (loading) return;
    onCountChange?.(comments.length);
  }, [comments.length, loading, onCountChange]);

  const threads = useMemo(() => buildCommentTree(comments), [comments]);

  function postComment(
    body: string,
    parentId?: string | null,
    mentionedUserIds: string[] = [],
    files: File[] = [],
  ) {
    startTransition(async () => {
      const result = await createTaskComment(
        projectId,
        listId,
        taskId,
        body,
        parentId,
        mentionedUserIds,
        files,
      );
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
        setReplyingTo(null);
        refresh();
      }
    });
  }

  function removeComment(commentId: string) {
    startTransition(async () => {
      const result = await deleteTaskComment(projectId, listId, commentId);
      if (result?.error) {
        setError(result.error);
      } else {
        if (replyingTo === commentId) setReplyingTo(null);
        refresh();
      }
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col lg:h-full">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 lg:pt-5">
        <h3 className="text-sm font-medium">
          Comments
          {!loading && comments.length > 0 ? (
            <span className="ml-2 font-normal text-[var(--muted)]">
              {comments.length}
            </span>
          ) : null}
        </h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 text-sm text-[var(--muted)] hover:text-[var(--foreground)] lg:hidden"
          >
            Back
          </button>
        ) : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto px-5 lg:mt-0 lg:py-3">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading comments…</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No comments yet.</p>
        ) : (
          threads.map((node) => (
            <CommentThread
              key={node.id}
              node={node}
              depth={0}
              members={mentionable}
              currentUserId={currentUserId}
              pending={pending}
              replyingTo={replyingTo}
              onToggleReply={(commentId) =>
                setReplyingTo((current) =>
                  current === commentId ? null : commentId,
                )
              }
              onCloseReply={() => setReplyingTo(null)}
              onSubmitReply={(parentId, body, mentionedUserIds, files) =>
                postComment(body, parentId, mentionedUserIds, files)
              }
              onDelete={removeComment}
            />
          ))
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:mt-0 lg:py-4 lg:pb-4">
        <p className="mb-1.5 text-sm text-[var(--muted)]">Add a comment</p>
        <CommentComposer
          placeholder="Share an update or ask a question…"
          submitLabel="Post comment"
          pending={pending}
          members={mentionable}
          onSubmit={(body, mentionedUserIds, files) =>
            postComment(body, null, mentionedUserIds, files)
          }
        />
        {error ? (
          <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
