"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { AttachmentGallery } from "@/components/attachment-gallery";
import { MentionText } from "@/components/mention-text";
import { PersonAvatar } from "@/components/person-avatar";
import { RichComposer } from "@/components/rich-composer";
import {
  createTaskComment,
  deleteTaskComment,
  listTaskComments,
  type CommentWithAuthor,
} from "@/lib/actions/comments";
import { type MentionPerson } from "@/lib/mentions";
import { personDisplayName } from "@/lib/person";
import { formatDateTime } from "@/lib/format-date";

const MAX_VISIBLE_INDENT = 5;

type CommentNode = CommentWithAuthor & { children: CommentNode[] };

function authorLabel(comment: CommentWithAuthor) {
  return personDisplayName(comment.author, "Unknown");
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
        <PersonAvatar
          name={authorLabel(comment)}
          avatarUrl={comment.author?.avatar_url}
        />
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
            <MentionText
              body={comment.body}
              people={members}
              className="mt-2 whitespace-pre-wrap text-sm"
            />
          ) : null}
          <AttachmentGallery attachments={comment.attachments ?? []} />
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
              <RichComposer
                placeholder={`Reply to ${authorLabel(comment)}…`}
                submitLabel="Post reply"
                pendingLabel="Posting…"
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
        <RichComposer
          placeholder="Share an update or ask a question…"
          submitLabel="Post comment"
          pendingLabel="Posting…"
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
