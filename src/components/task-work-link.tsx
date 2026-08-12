import Link from "next/link";
import { format, parseISO } from "date-fns";

import { StatusTag } from "@/components/status-tag";
import type { TaskStatus } from "@/types/database";

export type TaskWorkLinkProps = {
  href: string;
  title: string;
  status: TaskStatus;
  projectName: string;
  listName: string;
  taskKey?: string | null;
  dueDate?: string | null;
  /** ISO date (yyyy-mm-dd) used to mark overdue styling. */
  todayIso: string;
};

function formatDue(value: string) {
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM");
  } catch {
    return value;
  }
}

export function TaskWorkLink({
  href,
  title,
  status,
  projectName,
  listName,
  taskKey,
  dueDate,
  todayIso,
}: TaskWorkLinkProps) {
  const overdue = !!dueDate && dueDate < todayIso && status !== "done";

  return (
    <Link
      href={href}
      className={`group flex items-stretch gap-0 overflow-hidden rounded-xl border bg-[var(--surface)] transition hover:border-[var(--foreground)]/15 hover:bg-white active:bg-white ${
        overdue
          ? "border-[var(--danger)]/25"
          : "border-[var(--border)]"
      }`}
    >
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
        <div className="min-w-0">
          <p className="truncate font-medium tracking-tight leading-snug">
            {title}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {taskKey ? (
              <span className="font-medium tabular-nums tracking-wide">
                {taskKey}
              </span>
            ) : null}
            {taskKey ? " · " : null}
            {projectName} · {listName}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
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
          <span
            aria-hidden
            className="hidden text-[var(--muted)] transition group-hover:text-[var(--accent)] sm:inline"
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
