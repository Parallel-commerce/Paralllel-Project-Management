"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

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

const MAX_VISIBLE_INDENT = 5;

type CommentNode = CommentWithAuthor & { children: CommentNode[] };

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
  onSubmit: (body: string, mentionedUserIds: string[]) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialMentionIds);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (mentionStart === null) return [];
    return members
      .filter((person) => mentionQueryMatches(person, mentionQuery))
      .slice(0, 8);
  }, [members, mentionQuery, mentionStart]);

  useEffect(() => {
    setHighlight(0);
  }, [mentionQuery, mentionStart]);

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

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = body.trim();
        if (!next) return;
        onSubmit(next, selectedIds);
        setBody("");
        setSelectedIds([]);
        setMentionStart(null);
        setMentionQuery("");
      }}
    >
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => {
            const next = event.target.value;
            setBody(next);
            updateMentionState(next, event.target.selectionStart ?? next.length);
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
      <p className="text-xs text-[var(--muted)]">Type @ to mention someone.</p>
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
  onSubmitReply?: (body: string, mentionedUserIds: string[]) => void;
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
          <CommentBody body={comment.body} people={members} />
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
        onSubmitReply={(body, mentionedUserIds) =>
          onSubmitReply(node.id, body, mentionedUserIds)
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
}: {
  projectId: string;
  listId: string;
  taskId: string;
  currentUserId: string;
  members: MentionPerson[];
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
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

  const threads = useMemo(() => buildCommentTree(comments), [comments]);

  function postComment(
    body: string,
    parentId?: string | null,
    mentionedUserIds: string[] = [],
  ) {
    startTransition(async () => {
      const result = await createTaskComment(
        projectId,
        listId,
        taskId,
        body,
        parentId,
        mentionedUserIds,
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

      <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
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
              onSubmitReply={(parentId, body, mentionedUserIds) =>
                postComment(body, parentId, mentionedUserIds)
              }
              onDelete={removeComment}
            />
          ))
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm text-[var(--muted)]">Add a comment</p>
        <CommentComposer
          placeholder="Share an update or ask a question…"
          submitLabel="Post comment"
          pending={pending}
          members={mentionable}
          onSubmit={(body, mentionedUserIds) =>
            postComment(body, null, mentionedUserIds)
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
