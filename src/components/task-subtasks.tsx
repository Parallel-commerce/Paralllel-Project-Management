"use client";

import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { DueDatePicker } from "@/components/due-date-picker";
import type { ProfileOption } from "@/components/task-modal";
import {
  createTaskSubtask,
  deleteTaskSubtask,
  listTaskSubtasks,
  setTaskSubtaskCompleted,
  updateTaskSubtask,
} from "@/lib/actions/subtasks";
import { personDisplayName } from "@/lib/person";

export type TaskSubtaskItem = {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string;
  completed_at: string | null;
  assignee: ProfileOption | null;
};

export type AssignedSubtask = {
  id: string;
  title: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  listId: string;
  listName: string;
  taskId: string;
  taskTitle: string;
};

function displayName(profile?: ProfileOption | null) {
  if (!profile) return "Unassigned";
  return personDisplayName(profile, profile.email || "Someone");
}

function formatDue(value: string) {
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM yyyy");
  } catch {
    return value;
  }
}

function assigneeChoices(members: ProfileOption[], current: ProfileOption | null) {
  if (!current || members.some((member) => member.id === current.id)) {
    return members;
  }
  return [...members, current];
}

function subtaskHref(subtask: AssignedSubtask) {
  const params = new URLSearchParams({
    task: subtask.taskId,
    subtask: subtask.id,
  });
  return `/projects/${subtask.projectId}/lists/${subtask.listId}?${params.toString()}`;
}

export function SubtaskLink({
  subtask,
  todayIso,
}: {
  subtask: AssignedSubtask;
  todayIso: string;
}) {
  const overdue =
    !!subtask.dueDate && subtask.dueDate.slice(0, 10) < todayIso;
  return (
    <Link
      href={subtaskHref(subtask)}
      className={`group flex w-full items-stretch overflow-hidden rounded-xl border bg-[var(--surface)] text-left transition hover:border-[var(--foreground)]/15 hover:bg-white ${
        overdue ? "border-[var(--danger)]/25" : "border-[var(--border)]"
      }`}
    >
      <span
        aria-hidden
        className={`w-1 shrink-0 ${overdue ? "bg-[var(--danger)]" : "bg-[var(--accent)]/70"}`}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-3.5 sm:py-3">
        <span className="min-w-0">
          <span className="block truncate font-medium tracking-tight leading-snug">
            {subtask.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
            Subtask · {subtask.taskTitle} · {subtask.projectName} · {subtask.listName}
          </span>
        </span>
        <span
          className={`shrink-0 text-xs tabular-nums ${
            overdue ? "font-medium text-[var(--danger)]" : "text-[var(--muted)]"
          }`}
        >
          {subtask.dueDate ? formatDue(subtask.dueDate) : "No date"}
        </span>
      </span>
    </Link>
  );
}

function FieldLabel({
  children,
  optional,
}: {
  children: string;
  optional?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5 text-sm text-[var(--muted)]">
      {children}
      {optional ? <span className="font-normal opacity-70">(optional)</span> : null}
    </span>
  );
}

const fieldClass =
  "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";

function SubtaskFields({
  members,
  subtask,
  dueKey,
}: {
  members: ProfileOption[];
  subtask?: TaskSubtaskItem;
  dueKey: string;
}) {
  const choices = assigneeChoices(members, subtask?.assignee ?? null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <FieldLabel>Task</FieldLabel>
        <input
          name="title"
          required
          maxLength={300}
          defaultValue={subtask?.title ?? ""}
          placeholder="What needs doing"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <FieldLabel optional>Description</FieldLabel>
        <textarea
          name="description"
          rows={2}
          maxLength={8000}
          defaultValue={subtask?.description ?? ""}
          placeholder="Any extra detail"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel optional>Assignee</FieldLabel>
        <select
          name="assigned_to"
          defaultValue={subtask?.assigned_to ?? ""}
          className={fieldClass}
        >
          <option value="">Unassigned</option>
          {choices.map((member) => (
            <option key={member.id} value={member.id}>
              {displayName(member)}
            </option>
          ))}
        </select>
      </label>
      <DueDatePicker
        key={dueKey}
        name="due_date"
        label="Due date (optional)"
        defaultValue={subtask?.due_date ?? ""}
        placeholder="No due date"
      />
    </div>
  );
}

function SubtaskRow({
  projectId,
  taskId,
  subtask,
  members,
  currentUserId,
  canModerate,
  highlighted,
  today,
  onChanged,
}: {
  projectId: string;
  taskId: string;
  subtask: TaskSubtaskItem;
  members: ProfileOption[];
  currentUserId: string;
  canModerate: boolean;
  highlighted: boolean;
  today: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(highlighted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = !!subtask.completed_at;
  const overdue =
    !done && !!subtask.due_date && subtask.due_date.slice(0, 10) < today;
  const canDelete = canModerate || subtask.created_by === currentUserId;

  return (
    <li
      id={`subtask-${subtask.id}`}
      className={`rounded-xl border bg-[var(--surface)] px-3 py-3 ${
        highlighted
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
          : overdue
            ? "border-[var(--danger)]/25"
            : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={pending}
          aria-label={done ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
          onChange={() => {
            setError(null);
            startTransition(async () => {
              const result = await setTaskSubtaskCompleted(
                projectId,
                taskId,
                subtask.id,
                !done,
              );
              if (result && "error" in result && result.error) {
                setError(result.error);
              } else {
                onChanged();
              }
            });
          }}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium leading-snug ${
              done ? "text-[var(--muted)] line-through" : ""
            }`}
          >
            {subtask.title}
          </p>
          {subtask.description ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
              {subtask.description}
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {subtask.assignee ? displayName(subtask.assignee) : "Unassigned"}
            {" · "}
            <span className={overdue ? "font-medium text-[var(--danger)]" : ""}>
              {subtask.due_date ? formatDue(subtask.due_date) : "No due date"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing((open) => !open);
              setError(null);
            }}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
          >
            {editing ? "Close" : "Edit"}
          </button>
          {canDelete ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Delete subtask “${subtask.title}”?`)) return;
                setError(null);
                startTransition(async () => {
                  const result = await deleteTaskSubtask(
                    projectId,
                    taskId,
                    subtask.id,
                  );
                  if (result && "error" in result && result.error) {
                    setError(result.error);
                  } else {
                    onChanged();
                  }
                });
              }}
              className="text-sm text-[var(--danger)] hover:underline disabled:opacity-60"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form
          className="mt-3 border-t border-[var(--border)] pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("completed", done ? "1" : "");
            setError(null);
            startTransition(async () => {
              const result = await updateTaskSubtask(
                projectId,
                taskId,
                subtask.id,
                formData,
              );
              if (result && "error" in result && result.error) {
                setError(result.error);
              } else {
                setEditing(false);
                onChanged();
              }
            });
          }}
        >
          <SubtaskFields
            members={members}
            subtask={subtask}
            dueKey={`${subtask.id}-${subtask.due_date ?? "none"}`}
          />
          {error ? (
            <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-3 min-h-10 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      ) : error ? (
        <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function TaskSubtasks({
  projectId,
  taskId,
  members,
  currentUserId,
  canModerate,
  highlightId,
}: {
  projectId: string;
  taskId: string;
  members: ProfileOption[];
  currentUserId: string;
  canModerate: boolean;
  highlightId?: string | null;
}) {
  const [subtasks, setSubtasks] = useState<TaskSubtaskItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const completedRef = useRef<HTMLDetailsElement>(null);
  const open = (subtasks ?? []).filter((subtask) => !subtask.completed_at);
  const completed = (subtasks ?? []).filter((subtask) => subtask.completed_at);

  useEffect(() => {
    let cancelled = false;
    listTaskSubtasks(projectId, taskId).then((result) => {
      if (cancelled) return;
      if ("subtasks" in result && result.subtasks) {
        setSubtasks(result.subtasks);
        return;
      }
      if ("error" in result && result.error) {
        setError(result.error);
      }
      setSubtasks([]);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId, refreshKey]);

  useEffect(() => {
    if (!highlightId || !subtasks) return;
    const highlighted = subtasks.find((subtask) => subtask.id === highlightId);
    if (highlighted?.completed_at && completedRef.current) {
      completedRef.current.open = true;
    }
    document.getElementById(`subtask-${highlightId}`)?.scrollIntoView({
      block: "center",
    });
  }, [highlightId, subtasks]);

  function reload() {
    setRefreshKey((value) => value + 1);
  }

  return (
    <section className="mt-8 border-t border-[var(--border)] pt-6" aria-labelledby="subtasks-heading">
      <div>
        <h2 id="subtasks-heading" className="font-medium">
          Subtasks
          {open.length > 0 ? (
            <span className="ml-1.5 font-normal text-[var(--muted)]">{open.length}</span>
          ) : null}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          A task, description, assignee, and due date. No reporter.
        </p>
      </div>

      <form
        key={formKey}
        className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await createTaskSubtask(projectId, taskId, formData);
            if (result && "error" in result && result.error) {
              setError(result.error);
            } else {
              setFormKey((value) => value + 1);
              reload();
            }
          });
        }}
      >
        <SubtaskFields members={members} dueKey={`new-${formKey}`} />
        {error ? (
          <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-3 min-h-10 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add subtask"}
        </button>
      </form>

      {subtasks === null ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Loading subtasks…</p>
      ) : open.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">No open subtasks.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {open.map((subtask) => (
            <SubtaskRow
              key={subtask.id}
              projectId={projectId}
              taskId={taskId}
              subtask={subtask}
              members={members}
              currentUserId={currentUserId}
              canModerate={canModerate}
              highlighted={highlightId === subtask.id}
              today={today}
              onChanged={reload}
            />
          ))}
        </ul>
      )}

      {completed.length > 0 ? (
        <details ref={completedRef} className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--muted)]">
            Completed ({completed.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {completed.map((subtask) => (
              <SubtaskRow
                key={subtask.id}
                projectId={projectId}
                taskId={taskId}
                subtask={subtask}
                members={members}
                currentUserId={currentUserId}
                canModerate={canModerate}
                highlighted={highlightId === subtask.id}
                today={today}
                onChanged={reload}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export type TaskSubtaskPreview = {
  id: string;
  taskId: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  assigneeName: string | null;
};

function subtaskSummary(items: TaskSubtaskPreview[]) {
  const count = items.length;
  const noun = count === 1 ? "subtask" : "subtasks";
  const done = items.filter((item) => item.completedAt).length;
  if (done === 0) return `${count} ${noun}`;
  if (done === count) return `${count} ${noun} · done`;
  return `${count} ${noun} · ${done} done`;
}

export function TaskSubtaskExpander({
  projectId,
  subtasks,
  highlightId = null,
  interactive = true,
  onOpen,
}: {
  projectId: string;
  subtasks: TaskSubtaskPreview[];
  highlightId?: string | null;
  interactive?: boolean;
  onOpen?: (subtaskId: string) => void;
}) {
  const startsOpen = subtasks.some((item) => item.id === highlightId);
  const [open, setOpen] = useState(startsOpen);
  const [items, setItems] = useState(subtasks);
  const [previous, setPrevious] = useState(subtasks);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  if (subtasks !== previous) {
    setPrevious(subtasks);
    setItems(subtasks);
  }

  useEffect(() => {
    if (startsOpen) setOpen(true);
  }, [startsOpen]);

  if (items.length === 0) return null;

  const summary = subtaskSummary(items);

  if (!interactive) {
    return <p className="text-xs text-[var(--muted)]">{summary}</p>;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <span
          aria-hidden
          className={`inline-block transition ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {summary}
      </button>
      {open ? (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => {
            const done = !!item.completedAt;
            const overdue =
              !done && !!item.dueDate && item.dueDate.slice(0, 10) < today;
            return (
              <li key={item.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={done}
                  aria-label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
                  onChange={() => {
                    setError(null);
                    setItems((current) =>
                      current.map((row) =>
                        row.id === item.id
                          ? {
                              ...row,
                              completedAt: done ? null : new Date().toISOString(),
                            }
                          : row,
                      ),
                    );
                    startTransition(async () => {
                      const result = await setTaskSubtaskCompleted(
                        projectId,
                        item.taskId,
                        item.id,
                        !done,
                      );
                      if (result && "error" in result && result.error) {
                        setItems((current) =>
                          current.map((row) =>
                            row.id === item.id
                              ? { ...row, completedAt: item.completedAt }
                              : row,
                          ),
                        );
                        setError(result.error);
                      }
                    });
                  }}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                />
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <SubtaskPreviewText
                      item={item}
                      done={done}
                      overdue={overdue}
                    />
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <SubtaskPreviewText
                      item={item}
                      done={done}
                      overdue={overdue}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SubtaskPreviewText({
  item,
  done,
  overdue,
}: {
  item: TaskSubtaskPreview;
  done: boolean;
  overdue: boolean;
}) {
  return (
    <>
      <span
        className={`block text-sm leading-snug ${
          done ? "text-[var(--muted)] line-through" : ""
        }`}
      >
        {item.title}
      </span>
      <span className="mt-0.5 block text-xs text-[var(--muted)]">
        {item.assigneeName ?? "Unassigned"}
        {" · "}
        <span className={overdue ? "font-medium text-[var(--danger)]" : ""}>
          {item.dueDate ? formatDue(item.dueDate) : "No due date"}
        </span>
      </span>
    </>
  );
}
