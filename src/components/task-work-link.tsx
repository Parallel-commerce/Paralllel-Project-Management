"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useState, type ReactNode } from "react";

import { StatusTag } from "@/components/status-tag";
import { TaskCardQuickActions } from "@/components/task-card-actions";
import { TaskTypeTag } from "@/components/task-type-tag";
import type { TaskStatus, TaskType } from "@/types/database";

export type TaskWorkLinkProps = {
  href?: string;
  onOpen?: () => void;
  title: string;
  status: TaskStatus;
  taskType?: TaskType | null;
  projectName: string;
  listName: string;
  taskKey?: string | null;
  dueDate?: string | null;
  /** ISO date (yyyy-mm-dd) used to mark overdue styling. */
  todayIso: string;
  taskId?: string;
  projectId?: string;
  listId?: string;
  onTaskChange?: (patch: {
    status?: TaskStatus;
    due_date?: string | null;
  }) => void;
};

function formatDue(value: string) {
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM");
  } catch {
    return value;
  }
}

function OpenControl({
  href,
  onOpen,
  className,
  children,
  label,
  tabIndex,
}: {
  href?: string;
  onOpen?: () => void;
  className: string;
  children: ReactNode;
  label?: string;
  tabIndex?: number;
}) {
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        tabIndex={tabIndex}
        className={className}
      >
        {children}
      </button>
    );
  }
  return (
    <Link
      href={href ?? "/tasks"}
      aria-label={label}
      tabIndex={tabIndex}
      className={className}
    >
      {children}
    </Link>
  );
}

export function TaskWorkLink({
  href,
  onOpen,
  title,
  status: statusProp,
  taskType,
  projectName,
  listName,
  taskKey,
  dueDate: dueDateProp,
  todayIso,
  taskId,
  projectId,
  listId,
  onTaskChange,
}: TaskWorkLinkProps) {
  const [status, setStatus] = useState(statusProp);
  const [dueDate, setDueDate] = useState(dueDateProp ?? null);
  const [prevStatus, setPrevStatus] = useState(statusProp);
  const [prevDueDate, setPrevDueDate] = useState(dueDateProp ?? null);

  if (statusProp !== prevStatus) {
    setPrevStatus(statusProp);
    setStatus(statusProp);
  }
  const nextDueDate = dueDateProp ?? null;
  if (nextDueDate !== prevDueDate) {
    setPrevDueDate(nextDueDate);
    setDueDate(nextDueDate);
  }

  const quickActions = !!(taskId && projectId && listId);
  const overdue = !!dueDate && dueDate.slice(0, 10) < todayIso && status !== "done";
  const className = `group relative flex w-full items-stretch gap-0 overflow-hidden rounded-xl border bg-[var(--surface)] text-left transition hover:border-[var(--foreground)]/15 hover:bg-white ${
    overdue ? "border-[var(--danger)]/25" : "border-[var(--border)]"
  }`;

  const meta = (
    <span className="block min-w-0">
      <span className="block truncate font-medium tracking-tight leading-snug">
        {title}
      </span>
      <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
        {taskKey ? (
          <span className="font-medium tabular-nums tracking-wide">{taskKey}</span>
        ) : null}
        {taskKey ? " · " : null}
        {projectName} · {listName}
      </span>
    </span>
  );

  return (
    <div className={className}>
      <span
        aria-hidden
        className={`w-1 shrink-0 ${
          overdue
            ? "bg-[var(--danger)]"
            : status === "requiring_feedback"
              ? "bg-[var(--status-feedback-border)]"
              : status === "in_progress"
                ? "bg-[var(--status-progress-border)]"
                : status === "done"
                  ? "bg-[var(--status-done-border)]"
                  : "bg-[var(--status-todo-border)]"
        }`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-3.5 sm:py-3">
        <OpenControl
          href={href}
          onOpen={onOpen}
          className="min-w-0 flex-1 rounded-md text-left outline-none ring-[var(--accent)] focus-visible:ring-2"
        >
          {meta}
        </OpenControl>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <TaskTypeTag taskType={taskType} />
          {quickActions ? (
            <TaskCardQuickActions
              taskId={taskId}
              projectId={projectId}
              listId={listId}
              status={status}
              dueDate={dueDate}
              todayIso={todayIso}
              href={href}
              onOpen={onOpen}
              onStatusChange={(next) => {
                setStatus(next);
                onTaskChange?.({ status: next });
              }}
              onDueDateChange={(next) => {
                setDueDate(next);
                onTaskChange?.({ due_date: next });
              }}
            />
          ) : (
            <>
              <StatusTag status={status} />
              <span
                className={`text-xs tabular-nums ${
                  overdue
                    ? "font-medium text-[var(--danger)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {dueDate ? formatDue(dueDate) : "No date"}
              </span>
            </>
          )}
          <OpenControl
            href={href}
            onOpen={onOpen}
            label={`Open ${title}`}
            tabIndex={-1}
            className="hidden text-[var(--muted)] outline-none ring-[var(--accent)] transition group-hover:text-[var(--accent)] focus-visible:ring-2 sm:inline"
          >
            <span aria-hidden>→</span>
          </OpenControl>
        </div>
      </div>
    </div>
  );
}
