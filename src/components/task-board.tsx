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
import { useEffect, useMemo, useState, useTransition } from "react";

import { MyWorkCalendar } from "@/components/my-work-calendar";
import {
  TaskModal,
  type ProfileOption,
  type TaskWithPeople,
} from "@/components/task-modal";
import {
  formatTaskTime,
  type TimeEntryRow,
} from "@/components/time-tracking-panel";
import { updateTaskStatus } from "@/lib/actions/projects";
import { groupTasksByCompletedWeek } from "@/lib/completed-week";
import { personDisplayName } from "@/lib/person";
import { formatScheduledWeekdays } from "@/lib/scheduled-weekdays";
import { taskStatusColors } from "@/lib/task-status";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

export type { TaskWithPeople };

type DueFilter = "all" | "overdue" | "this_week" | "none";
type ViewMode = "list" | "board" | "calendar";

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
  const colors = taskStatusColors(status);

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
      ) : status === "done" ? (
        <div className="bg-[var(--surface)]/70">
          {groupTasksByCompletedWeek(tasks).map((week, index) => (
            <div key={week.key}>
              <div
                className={`flex items-baseline justify-between gap-3 px-4 pb-1.5 pt-3 ${
                  index > 0 ? "mt-1 border-t border-[var(--border)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${colors.label}`}>
                    {week.title}
                  </p>
                  {week.range ? (
                    <p className="text-[11px] text-[var(--muted)]">
                      {week.range}
                    </p>
                  ) : null}
                </div>
                <span className={`text-xs tabular-nums ${colors.label} opacity-70`}>
                  {week.tasks.length}
                </span>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {week.tasks.map((task) => (
                  <TaskListRow
                    key={task.id}
                    task={task}
                    onOpen={() => onOpen(task)}
                    trackedSeconds={timeSecondsByTaskId?.[task.id]}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
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
  const colors = taskStatusColors(status);

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
        ) : status === "done" ? (
          groupTasksByCompletedWeek(tasks).map((week) => (
            <div key={week.key} className="flex flex-col gap-2">
              <div className="px-1 pt-1">
                <p className={`text-[11px] font-medium ${colors.label}`}>
                  {week.title}
                </p>
                {week.range ? (
                  <p className="text-[11px] leading-tight text-[var(--muted)]">
                    {week.range}
                  </p>
                ) : null}
              </div>
              {week.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={() => onOpen(task)}
                  trackedSeconds={timeSecondsByTaskId?.[task.id]}
                />
              ))}
            </div>
          ))
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

export function TaskBoard({
  projectId,
  listId,
  tasks: initialTasks,
  members,
  currentUserId,
  defaultAssigneeId = null,
  initialTaskId,
  initialReplyCommentId = null,
  canTrackTime = false,
  isTimeAdmin = false,
  timeSecondsByTaskId: initialTimeSeconds = {},
  runningEntry = null,
  scheduledWeekdays = [],
}: {
  projectId: string;
  listId: string;
  tasks: TaskWithPeople[];
  members: ProfileOption[];
  currentUserId: string;
  defaultAssigneeId?: string | null;
  initialTaskId?: string | null;
  initialReplyCommentId?: string | null;
  canTrackTime?: boolean;
  isTimeAdmin?: boolean;
  timeSecondsByTaskId?: Record<string, number>;
  runningEntry?: TimeEntryRow | null;
  scheduledWeekdays?: number[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskWithPeople | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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
  const undated = useMemo(
    () => filtered.filter((task) => !task.due_date),
    [filtered],
  );
  const scheduledLabel = formatScheduledWeekdays(scheduledWeekdays);

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
      prev.map((task) => {
        if (task.id !== taskId) return task;
        if (nextStatus === "done") {
          return {
            ...task,
            status: nextStatus,
            completed_at: task.completed_at ?? new Date().toISOString(),
          };
        }
        if (task.status === "done") {
          return { ...task, status: nextStatus, completed_at: null };
        }
        return { ...task, status: nextStatus };
      }),
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
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`rounded px-3 py-1.5 text-sm ${
                  viewMode === "calendar"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Calendar
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

      {viewMode === "calendar" ? (
        <div>
          {scheduledLabel ? (
            <p className="mb-3 text-sm text-[var(--muted)]">
              {scheduledLabel} highlighted for this project.
            </p>
          ) : null}
          <MyWorkCalendar
            tasks={filtered}
            todayIso={todayIso()}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenTask={(taskId) => {
              const match = tasks.find((task) => task.id === taskId);
              if (!match) return;
              setEditing(match);
              if (match.due_date) setSelectedDay(match.due_date.slice(0, 10));
            }}
            showContext={false}
            highlightedWeekdays={scheduledWeekdays}
          />
          {undated.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-sm font-medium">No due date</h2>
              <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {undated.map((task) => (
                  <TaskListRow
                    key={task.id}
                    task={task}
                    onOpen={() => setEditing(task)}
                    trackedSeconds={timeSecondsByTaskId?.[task.id]}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : tasks.length === 0 ? (
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
          defaultAssigneeId={defaultAssigneeId}
          scheduledWeekdays={scheduledWeekdays}
          defaultDueDate={
            viewMode === "calendar" ? selectedDay : null
          }
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
          initialReplyCommentId={initialReplyCommentId}
          scheduledWeekdays={scheduledWeekdays}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
