"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  markTaskCommentRead,
  markTaskCommentsRead,
} from "@/lib/actions/comments";

export type RecentCommentItem = {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  isClient: boolean;
  taskId: string;
  taskKey: string | null;
  taskTitle: string;
  listId: string;
  projectId: string;
  projectName: string;
};

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

function truncate(text: string, max = 160) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function RecentCommentsList({
  comments: initialComments,
}: {
  comments: RecentCommentItem[];
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [pending, startTransition] = useTransition();
  const clientCount = comments.filter((comment) => comment.isClient).length;

  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  function clearOne(commentId: string) {
    setComments((current) => current.filter((item) => item.id !== commentId));
    startTransition(async () => {
      await markTaskCommentRead(commentId);
      router.refresh();
    });
  }

  function clearAll() {
    const ids = comments.map((comment) => comment.id);
    setComments([]);
    startTransition(async () => {
      await markTaskCommentsRead(ids);
      router.refresh();
    });
  }

  function openComment(comment: RecentCommentItem) {
    router.push(
      `/projects/${comment.projectId}/lists/${comment.listId}?task=${comment.taskId}&reply=${comment.id}`,
    );
  }

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Recent comments</h2>
          <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
            Comments waiting for your reply
            {clientCount > 0 ? " — client comments are listed first." : "."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {clientCount > 0 ? (
            <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent)]">
              {clientCount} client
              {clientCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {comments.length > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={clearAll}
              className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              Mark all read
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:mt-4">
        {comments.length === 0 ? (
          <li className="px-4 py-6 text-sm text-[var(--muted)] sm:py-8">
            You&apos;re caught up. New comments from others will show here until
            you reply or mark them read.
          </li>
        ) : (
          comments.map((comment) => (
            <li
              key={comment.id}
              className="flex items-start gap-2 px-4 py-3 sm:py-3.5"
            >
              <button
                type="button"
                onClick={() => openComment(comment)}
                className="min-w-0 flex-1 rounded-md text-left transition hover:bg-[var(--surface-2)]/70"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{comment.authorName}</p>
                  {comment.isClient ? (
                    <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                      Client
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]">
                  {truncate(comment.body)}
                </p>
                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  {comment.taskKey ? `${comment.taskKey} · ` : ""}
                  {comment.taskTitle} · {comment.projectName} ·{" "}
                  {formatWhen(comment.created_at)}
                  <span className="text-[var(--accent)]"> · Reply</span>
                </p>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => clearOne(comment.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                Mark read
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
