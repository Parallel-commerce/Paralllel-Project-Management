"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  createTaskComment,
  deleteTaskComment,
  listTaskComments,
  type CommentWithAuthor,
} from "@/lib/actions/comments";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function authorLabel(comment: CommentWithAuthor) {
  return comment.author?.full_name || comment.author?.email || "Unknown";
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
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

function CommentComposer({
  placeholder,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = body.trim();
        if (!next) return;
        onSubmit(next);
        setBody("");
      }}
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={onCancel ? 2 : 3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Posting…" : submitLabel}
        </button>
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
  isReply,
  currentUserId,
  pending,
  replyOpen,
  onReply,
  onCloseReply,
  onSubmitReply,
  onDelete,
}: {
  comment: CommentWithAuthor;
  isReply?: boolean;
  currentUserId: string;
  pending: boolean;
  replyOpen?: boolean;
  onReply?: () => void;
  onCloseReply?: () => void;
  onSubmitReply?: (body: string) => void;
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
                {formatWhen(comment.created_at)}
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
          <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
          {!isReply && onReply ? (
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
                autoFocus
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

export function TaskComments({
  projectId,
  listId,
  taskId,
  currentUserId,
}: {
  projectId: string;
  listId: string;
  taskId: string;
  currentUserId: string;
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    setReplyingTo(null);
    listTaskComments(taskId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setComments(result.comments);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const threads = useMemo(() => {
    const roots = comments.filter((comment) => !comment.parent_id);
    const repliesByParent = new Map<string, CommentWithAuthor[]>();
    for (const comment of comments) {
      if (!comment.parent_id) continue;
      const list = repliesByParent.get(comment.parent_id) ?? [];
      list.push(comment);
      repliesByParent.set(comment.parent_id, list);
    }
    return roots.map((root) => ({
      root,
      replies: repliesByParent.get(root.id) ?? [],
    }));
  }, [comments]);

  function postComment(body: string, parentId?: string | null) {
    startTransition(async () => {
      const result = await createTaskComment(
        projectId,
        listId,
        taskId,
        body,
        parentId,
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
    <section className="mt-6 border-t border-[var(--border)] pt-4">
      <h3 className="text-sm font-medium">Comments</h3>

      <div className="mt-3 max-h-80 space-y-4 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading comments…</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No comments yet.</p>
        ) : (
          threads.map(({ root, replies }) => (
            <div
              key={root.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)]/60 px-3 py-3"
            >
              <CommentItem
                comment={root}
                currentUserId={currentUserId}
                pending={pending}
                replyOpen={replyingTo === root.id}
                onReply={() =>
                  setReplyingTo((current) =>
                    current === root.id ? null : root.id,
                  )
                }
                onCloseReply={() => setReplyingTo(null)}
                onSubmitReply={(body) => postComment(body, root.id)}
                onDelete={() => removeComment(root.id)}
              />
              {replies.length > 0 ? (
                <ul className="mt-3 space-y-3 border-l-2 border-[var(--border)] pl-3 sm:ml-4 sm:pl-4">
                  {replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        comment={reply}
                        isReply
                        currentUserId={currentUserId}
                        pending={pending}
                        onDelete={() => removeComment(reply.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm text-[var(--muted)]">Add a comment</p>
        <CommentComposer
          placeholder="Share an update or ask a question…"
          submitLabel="Post comment"
          pending={pending}
          onSubmit={(body) => postComment(body)}
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
