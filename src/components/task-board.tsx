"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { DueDatePicker } from "@/components/due-date-picker";
import { TaskAttachments } from "@/components/task-attachments";
import { TaskComments } from "@/components/task-comments";
import { TaskStatusHistory } from "@/components/task-status-history";
import {
  formatTaskTime,
  TimeTrackingPanel,
  type TimeEntryRow,
} from "@/components/time-tracking-panel";
import {
  createTask,
  deleteTask,
  updateTask,
  updateTaskStatus,
} from "@/lib/actions/projects";
import { personDisplayName } from "@/lib/person";
import {
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from "@/types/database";

type ProfileOption = {
  id: string;
  email: string;
  full_name: string | null;
  deleted_at?: string | null;
};

export type TaskWithPeople = Task & {
  creator?: ProfileOption | null;
  reporter?: ProfileOption | null;
  assignee?: ProfileOption | null;
};

type DueFilter = "all" | "overdue" | "this_week" | "none";

function displayName(profile?: ProfileOption | null) {
  if (!profile) return "Unassigned";
  return personDisplayName(profile, profile.email || "Someone");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function endOfWeekIso() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSunday = (7 - day) % 7;
  const end = new Date(now);
  end.setDate(now.getDate() + daysUntilSunday);
  return end.toISOString().slice(0, 10);
}

function matchesDueFilter(task: TaskWithPeople, dueFilter: DueFilter) {
  const today = todayIso();
  const weekEnd = endOfWeekIso();
  if (dueFilter === "all") return true;
  if (dueFilter === "none") return !task.due_date;
  if (!task.due_date) return false;
  if (dueFilter === "overdue") {
    return task.due_date < today && task.status !== "done";
  }
  if (dueFilter === "this_week") {
    return task.due_date >= today && task.due_date <= weekEnd;
  }
  return true;
}

function TaskCard({
  task,
  onOpen,
  dragging,
  trackedSeconds,
}: {
  task: TaskWithPeople;
  onOpen: () => void;
  dragging?: boolean;
  trackedSeconds?: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });

  return (
    <article
      ref={setNodeRef}
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm ${
        isDragging || dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-[var(--muted)] active:cursor-grabbing"
          aria-label="Drag task"
          {...listeners}
          {...attributes}
        >
          ⋮⋮
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          {task.key ? (
            <p className="text-[11px] font-medium tabular-nums tracking-wide text-[var(--muted)]">
              {task.key}
            </p>
          ) : null}
          <h3 className="font-medium leading-snug">{task.title}</h3>
          {task.link_url ? (
            <p className="mt-1 truncate text-xs text-[var(--accent)]">Link</p>
          ) : null}
          {task.due_date ? (
            <p
              className={`mt-1 text-xs ${
                task.due_date < todayIso() && task.status !== "done"
                  ? "text-[var(--danger)]"
                  : "text-[var(--muted)]"
              }`}
            >
              Due {task.due_date}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]">
            {task.assignee
              ? `Assigned · ${displayName(task.assignee)}`
              : "Unassigned"}
          </p>
          {task.reporter ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Reported · {displayName(task.reporter)}
            </p>
          ) : null}
          {trackedSeconds && trackedSeconds > 0 ? (
            <p className="mt-0.5 text-xs tabular-nums text-[var(--muted)]">
              Time · {formatTaskTime(trackedSeconds)}
            </p>
          ) : null}
        </button>
      </div>
    </article>
  );
}

function TaskListRow({
  task,
  onOpen,
  trackedSeconds,
}: {
  task: TaskWithPeople;
  onOpen: () => void;
  trackedSeconds?: number;
}) {
  const overdue =
    !!task.due_date && task.due_date < todayIso() && task.status !== "done";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-1 px-3 py-3 text-left hover:bg-[var(--surface)]/80 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="min-w-0">
          {task.key ? (
            <p className="text-[11px] font-medium tabular-nums tracking-wide text-[var(--muted)]">
              {task.key}
            </p>
          ) : null}
          <p className="font-medium leading-snug">{task.title}</p>
          <p className="mt-1 text-xs text-[var(--muted)] sm:hidden">
            {task.assignee
              ? displayName(task.assignee)
              : "Unassigned"}
            {task.reporter ? ` · Rep. ${displayName(task.reporter)}` : ""}
            {trackedSeconds && trackedSeconds > 0
              ? ` · ${formatTaskTime(trackedSeconds)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)] sm:shrink-0 sm:justify-end">
          <span className="hidden sm:inline">
            {task.assignee ? displayName(task.assignee) : "Unassigned"}
          </span>
          <span className="hidden md:inline">
            {task.reporter
              ? `Rep. ${displayName(task.reporter)}`
              : "No reporter"}
          </span>
          {trackedSeconds && trackedSeconds > 0 ? (
            <span className="hidden tabular-nums sm:inline">
              {formatTaskTime(trackedSeconds)}
            </span>
          ) : null}
          <span className={overdue ? "text-[var(--danger)]" : ""}>
            {task.due_date ? `Due ${task.due_date}` : "No due date"}
          </span>
          {task.link_url ? (
            <span className="text-[var(--accent)]">Link</span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function statusColumnStyle(status: TaskStatus) {
  switch (status) {
    case "todo":
      return {
        bg: "bg-[var(--status-todo-bg)]",
        border: "border-[var(--status-todo-border)]/35",
        accent: "bg-[var(--status-todo-border)]",
        label: "text-[var(--status-todo-label)]",
      };
    case "in_progress":
      return {
        bg: "bg-[var(--status-progress-bg)]",
        border: "border-[var(--status-progress-border)]/35",
        accent: "bg-[var(--status-progress-border)]",
        label: "text-[var(--status-progress-label)]",
      };
    case "requiring_feedback":
      return {
        bg: "bg-[var(--status-feedback-bg)]",
        border: "border-[var(--status-feedback-border)]/30",
        accent: "bg-[var(--status-feedback-border)]",
        label: "text-[var(--status-feedback-label)]",
      };
    case "done":
      return {
        bg: "bg-[var(--status-done-bg)]",
        border: "border-[var(--status-done-border)]/35",
        accent: "bg-[var(--status-done-border)]",
        label: "text-[var(--status-done-label)]",
      };
  }
}

function StatusListSection({
  status,
  label,
  tasks,
  onOpen,
  timeSecondsByTaskId,
}: {
  status: TaskStatus;
  label: string;
  tasks: TaskWithPeople[];
  onOpen: (task: TaskWithPeople) => void;
  timeSecondsByTaskId?: Record<string, number>;
}) {
  const colors = statusColumnStyle(status);

  return (
    <section
      className={`overflow-hidden rounded-xl border ${colors.border} ${colors.bg}`}
    >
      <div
        className={`flex items-center gap-2.5 border-b ${colors.border} px-4 py-3`}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.accent}`}
          aria-hidden
        />
        <h2 className={`text-sm font-medium tracking-tight ${colors.label}`}>
          {label}
          <span className="ml-2 font-normal opacity-70">{tasks.length}</span>
        </h2>
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--muted)]">No tasks</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] bg-[var(--surface)]/70">
          {tasks.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
              trackedSeconds={timeSecondsByTaskId?.[task.id]}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusColumn({
  status,
  label,
  tasks,
  onOpen,
  timeSecondsByTaskId,
}: {
  status: TaskStatus;
  label: string;
  tasks: TaskWithPeople[];
  onOpen: (task: TaskWithPeople) => void;
  timeSecondsByTaskId?: Record<string, number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colors = statusColumnStyle(status);

  return (
    <section
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition ${colors.border} ${
        isOver ? "bg-[var(--accent-soft)]/80 ring-2 ring-[var(--accent)]/30" : colors.bg
      }`}
    >
      <div className="flex items-center gap-2 px-1">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.accent}`}
          aria-hidden
        />
        <h2 className={`text-sm font-medium tracking-tight ${colors.label}`}>
          {label}
          <span className="ml-2 font-normal opacity-70">{tasks.length}</span>
        </h2>
      </div>
      <div className="mt-3 flex min-h-24 flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-xs text-[var(--muted)]">
            Drop tasks here
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
              trackedSeconds={timeSecondsByTaskId?.[task.id]}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TaskModal({
  mode,
  projectId,
  listId,
  members,
  currentUserId,
  task,
  canTrackTime = false,
  isTimeAdmin = false,
  runningEntry = null,
  onClose,
}: {
  mode: "create" | "edit";
  projectId: string;
  listId: string;
  members: ProfileOption[];
  currentUserId: string;
  task?: TaskWithPeople | null;
  canTrackTime?: boolean;
  isTimeAdmin?: boolean;
  runningEntry?: TimeEntryRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg sm:rounded-xl sm:p-6 md:p-7"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl tracking-tight">
              {mode === "create" ? "New task" : "Edit task"}
            </h2>
            {mode === "edit" && task?.key ? (
              <p className="mt-1 text-sm font-medium tabular-nums tracking-wide text-[var(--muted)]">
                {task.key}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 min-w-9 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Close
          </button>
        </div>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result =
                mode === "create"
                  ? await createTask(projectId, listId, formData)
                  : await updateTask(projectId, listId, task!.id, formData);
              if (result?.error) {
                setError(result.error);
              } else if (mode === "create") {
                onClose();
              } else {
                setError(null);
                setHistoryKey((value) => value + 1);
                router.refresh();
              }
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Title
            <input
              name="title"
              required
              defaultValue={task?.title ?? ""}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Description
            <textarea
              name="description"
              rows={4}
              defaultValue={task?.description ?? ""}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <DueDatePicker name="due_date" defaultValue={task?.due_date ?? ""} />
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Status
              <select
                name="status"
                defaultValue={task?.status ?? "todo"}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Link
            <input
              name="link_url"
              type="url"
              placeholder="https://…"
              defaultValue={task?.link_url ?? ""}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Reporter
              <select
                name="reported_by"
                defaultValue={task?.reported_by ?? currentUserId}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {displayName(member)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Assignee
              <select
                name="assigned_to"
                defaultValue={task?.assigned_to ?? ""}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {displayName(member)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mode === "edit" && task?.link_url ? (
            <p className="text-sm">
              <a
                href={task.link_url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Open link
              </a>
            </p>
          ) : null}

          {mode === "edit" && task ? (
            <p className="text-xs text-[var(--muted)]">
              Created by {displayName(task.creator)}
            </p>
          ) : null}

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save task"}
            </button>
            {mode === "edit" && task ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteTask(projectId, listId, task.id);
                    if (result?.error) {
                      setError(result.error);
                    } else {
                      onClose();
                    }
                  });
                }}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>

        {mode === "edit" && task ? (
          <>
            <TaskStatusHistory
              projectId={projectId}
              taskId={task.id}
              refreshKey={historyKey}
            />
            {canTrackTime ? (
              <TimeTrackingPanel
                projectId={projectId}
                listId={listId}
                taskId={task.id}
                currentUserId={currentUserId}
                isAdmin={isTimeAdmin}
                runningEntry={runningEntry}
              />
            ) : null}
            <TaskAttachments
              projectId={projectId}
              listId={listId}
              taskId={task.id}
            />
            <TaskComments
              projectId={projectId}
              listId={listId}
              taskId={task.id}
              currentUserId={currentUserId}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function TaskBoard({
  projectId,
  listId,
  tasks: initialTasks,
  members,
  currentUserId,
  initialTaskId,
  canTrackTime = false,
  isTimeAdmin = false,
  timeSecondsByTaskId: initialTimeSeconds = {},
  runningEntry = null,
}: {
  projectId: string;
  listId: string;
  tasks: TaskWithPeople[];
  members: ProfileOption[];
  currentUserId: string;
  initialTaskId?: string | null;
  canTrackTime?: boolean;
  isTimeAdmin?: boolean;
  timeSecondsByTaskId?: Record<string, number>;
  runningEntry?: TimeEntryRow | null;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskWithPeople | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [reporterFilter, setReporterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    if (!initialTaskId) return;
    const match = initialTasks.find((task) => task.id === initialTaskId);
    if (match) {
      setEditing(match);
    }
  }, [initialTaskId, initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (assigneeFilter === "unassigned" && task.assigned_to) return false;
      if (
        assigneeFilter !== "all" &&
        assigneeFilter !== "unassigned" &&
        task.assigned_to !== assigneeFilter
      ) {
        return false;
      }
      if (reporterFilter !== "all" && task.reported_by !== reporterFilter) {
        return false;
      }
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (!matchesDueFilter(task, dueFilter)) return false;
      if (!q) return true;
      return (
        task.title.toLowerCase().includes(q) ||
        (task.key ?? "").toLowerCase().includes(q) ||
        (task.description ?? "").toLowerCase().includes(q) ||
        displayName(task.assignee).toLowerCase().includes(q) ||
        displayName(task.reporter).toLowerCase().includes(q)
      );
    });
  }, [tasks, query, assigneeFilter, reporterFilter, statusFilter, dueFilter]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      TASK_STATUSES.map((status) => [status.value, [] as TaskWithPeople[]]),
    ) as Record<TaskStatus, TaskWithPeople[]>;
    for (const task of filtered) {
      map[task.status]?.push(task);
    }
    return map;
  }, [filtered]);

  const timeSecondsByTaskId = canTrackTime ? initialTimeSeconds : undefined;

  const filtersActive =
    query.trim() !== "" ||
    assigneeFilter !== "all" ||
    reporterFilter !== "all" ||
    statusFilter !== "all" ||
    dueFilter !== "all";

  function clearFilters() {
    setQuery("");
    setAssigneeFilter("all");
    setReporterFilter("all");
    setStatusFilter("all");
    setDueFilter("all");
  }

  const activeTask = activeId
    ? (tasks.find((task) => task.id === activeId) ?? null)
    : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    const nextStatus = TASK_STATUSES.some((s) => s.value === overId)
      ? (overId as TaskStatus)
      : null;
    if (!nextStatus) return;

    const current = tasks.find((task) => task.id === taskId);
    if (!current || current.status === nextStatus) return;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: nextStatus } : task,
      ),
    );

    startTransition(async () => {
      const result = await updateTaskStatus(
        projectId,
        listId,
        taskId,
        nextStatus,
      );
      if (result?.error) {
        setTasks(initialTasks);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <p className="text-sm text-[var(--muted)]">
              {filtered.length} of {tasks.length} task
              {tasks.length === 1 ? "" : "s"}
              {tasks.length === 0
                ? " — create your first task to get started."
                : ""}
            </p>
            <div
              className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded px-3 py-1.5 text-sm ${
                  viewMode === "list"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={`rounded px-3 py-1.5 text-sm ${
                  viewMode === "board"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Board
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                filtersOpen || filtersActive
                  ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
              }`}
            >
              Filters
              {filtersActive ? (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                  aria-hidden
                />
              ) : null}
            </button>
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-10 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] sm:w-auto"
          >
            New task
          </button>
        </div>

        {filtersOpen ? (
          <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, key, assignee, reporter…"
                className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Assignee
              <select
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="all">Anyone</option>
                <option value="unassigned">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {displayName(member)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Reporter
              <select
                value={reporterFilter}
                onChange={(event) => setReporterFilter(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="all">Anyone</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {displayName(member)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | TaskStatus)
                }
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="all">All statuses</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Due date
              <select
                value={dueFilter}
                onChange={(event) =>
                  setDueFilter(event.target.value as DueFilter)
                }
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="all">Any due date</option>
                <option value="overdue">Overdue</option>
                <option value="this_week">Due this week</option>
                <option value="none">No due date</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/70 px-6 py-16 text-center">
          <p className="font-display text-xl tracking-tight">No tasks yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            Create a task, assign someone, and move work through statuses as it
            progresses.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            Create first task
          </button>
        </div>
      ) : viewMode === "list" ? (
        <div className="flex flex-col gap-4">
          {TASK_STATUSES.map((status) => (
            <StatusListSection
              key={status.value}
              status={status.value}
              label={status.label}
              tasks={grouped[status.value]}
              onOpen={setEditing}
              timeSecondsByTaskId={timeSecondsByTaskId}
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="scroll-x-fade flex snap-x snap-mandatory gap-3 pb-2 xl:grid xl:snap-none xl:grid-cols-4 xl:overflow-visible xl:pb-0">
            {TASK_STATUSES.map((status) => (
              <div
                key={status.value}
                className="w-[min(85vw,20rem)] shrink-0 snap-center xl:w-auto"
              >
                <StatusColumn
                  status={status.value}
                  label={status.label}
                  tasks={grouped[status.value]}
                  onOpen={setEditing}
                  timeSecondsByTaskId={timeSecondsByTaskId}
                />
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                onOpen={() => undefined}
                dragging
                trackedSeconds={timeSecondsByTaskId?.[activeTask.id]}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {creating ? (
        <TaskModal
          mode="create"
          projectId={projectId}
          listId={listId}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {editing ? (
        <TaskModal
          mode="edit"
          projectId={projectId}
          listId={listId}
          members={members}
          currentUserId={currentUserId}
          task={editing}
          canTrackTime={canTrackTime}
          isTimeAdmin={isTimeAdmin}
          runningEntry={runningEntry}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
