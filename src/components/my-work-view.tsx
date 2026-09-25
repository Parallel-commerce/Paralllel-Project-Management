"use client";

import { addDays, format, parseISO } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  HomeQuickTaskForm,
  type HomeListOption,
} from "@/components/home-quick-task-form";
import { MyWorkCalendar } from "@/components/my-work-calendar";
import {
  TaskModal,
  type ProfileOption,
  type TaskWithPeople,
} from "@/components/task-modal";
import { TaskWorkLink } from "@/components/task-work-link";
import type { TaskStatus } from "@/types/database";
import type { TimeEntryRow } from "@/components/time-tracking-panel";

export type WorkView = "mine" | "reported" | "overdue" | "week" | "waiting";
export type WorkLayout = "list" | "calendar";

export type MyWorkTask = TaskWithPeople & {
  listName: string;
  projectName: string;
};

export type ProjectWorkContext = {
  members: ProfileOption[];
  canTrackTime: boolean;
  isTimeAdmin: boolean;
  scheduledWeekdays: number[];
};

const TABS: { id: WorkView; label: string }[] = [
  { id: "mine", label: "My tasks" },
  { id: "reported", label: "Reported by me" },
  { id: "waiting", label: "Waiting on client" },
  { id: "overdue", label: "Overdue" },
  { id: "week", label: "Due this week" },
];

const DUE_SECTIONS = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "tomorrow", label: "Due tomorrow" },
  { id: "later", label: "Later" },
] as const;

type DueSectionId = (typeof DUE_SECTIONS)[number]["id"];

function tomorrowIso(today: string) {
  try {
    return format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  } catch {
    return today;
  }
}

function dueSectionId(
  dueDate: string | null,
  today: string,
  tomorrow: string,
): DueSectionId {
  if (!dueDate) return "later";
  const day = dueDate.slice(0, 10);
  if (day < today) return "overdue";
  if (day === today) return "today";
  if (day === tomorrow) return "tomorrow";
  return "later";
}

function groupTasksByDue(tasks: MyWorkTask[], today: string) {
  const tomorrow = tomorrowIso(today);
  const groups: Record<DueSectionId, MyWorkTask[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    later: [],
  };
  for (const task of tasks) {
    groups[dueSectionId(task.due_date, today, tomorrow)].push(task);
  }
  return DUE_SECTIONS.map((section) => ({
    ...section,
    tasks: groups[section.id],
  })).filter((section) => section.tasks.length > 0);
}

export function myWorkHref({
  view,
  layout,
  task,
}: {
  view: WorkView;
  layout: WorkLayout;
  task?: string | null;
}) {
  const params = new URLSearchParams();
  if (view !== "mine") params.set("view", view);
  if (layout === "calendar") params.set("layout", "calendar");
  if (task) params.set("task", task);
  const qs = params.toString();
  return qs ? `/tasks?${qs}` : "/tasks";
}

function membersForTask(
  task: MyWorkTask,
  context?: ProjectWorkContext,
): ProfileOption[] {
  const members = [...(context?.members ?? [])];
  const seen = new Set(members.map((member) => member.id));
  for (const person of [task.creator, task.reporter, task.assignee]) {
    if (person && !seen.has(person.id)) {
      members.push(person);
      seen.add(person.id);
    }
  }
  return members;
}

function emptyCopy(view: WorkView) {
  if (view === "mine") {
    return "When tasks are assigned to you, they’ll show up in this list.";
  }
  if (view === "reported") return "Tasks you reported will show up here.";
  if (view === "overdue") return "You’re clear — no overdue assigned tasks.";
  if (view === "waiting") return "No tasks are waiting on client feedback.";
  return "No assigned tasks due through the end of this week.";
}

export function MyWorkView({
  view,
  layout,
  tasks: incomingTasks,
  lists,
  currentUserId,
  todayIso,
  initialTaskId,
  projectContext,
  runningEntry,
}: {
  view: WorkView;
  layout: WorkLayout;
  tasks: MyWorkTask[];
  lists: HomeListOption[];
  currentUserId: string;
  todayIso: string;
  initialTaskId?: string | null;
  projectContext: Record<string, ProjectWorkContext>;
  runningEntry: TimeEntryRow | null;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(incomingTasks);
  const [prevIncomingTasks, setPrevIncomingTasks] = useState(incomingTasks);
  if (incomingTasks !== prevIncomingTasks) {
    setPrevIncomingTasks(incomingTasks);
    setTasks(incomingTasks);
  }

  function patchTask(
    taskId: string,
    patch: { status?: TaskStatus; due_date?: string | null },
  ) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...patch } : task,
      ),
    );
  }

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(
    initialTaskId ?? null,
  );
  const [cachedEditing, setCachedEditing] = useState<MyWorkTask | null>(() => {
    return incomingTasks.find((task) => task.id === initialTaskId) ?? null;
  });
  const [prevInitialTaskId, setPrevInitialTaskId] = useState(initialTaskId);
  const [selectedDay, setSelectedDay] = useState<string | null>(() => {
    const match = incomingTasks.find((task) => task.id === initialTaskId);
    return match?.due_date?.slice(0, 10) ?? null;
  });

  if (initialTaskId !== prevInitialTaskId) {
    setPrevInitialTaskId(initialTaskId);
    setEditingId(initialTaskId ?? null);
    if (!initialTaskId) {
      setCachedEditing(null);
    }
  }

  const editing =
    (editingId ? tasks.find((task) => task.id === editingId) : null) ??
    (cachedEditing && cachedEditing.id === editingId ? cachedEditing : null);

  const undated = useMemo(
    () => tasks.filter((task) => !task.due_date),
    [tasks],
  );

  const dueGroups = useMemo(
    () => groupTasksByDue(tasks, todayIso),
    [tasks, todayIso],
  );

  const editingContext = editing
    ? projectContext[editing.project_id]
    : undefined;

  function openTask(task: MyWorkTask) {
    setEditingId(task.id);
    setCachedEditing(task);
    if (task.due_date) setSelectedDay(task.due_date.slice(0, 10));
    router.replace(myWorkHref({ view, layout, task: task.id }), {
      scroll: false,
    });
  }

  function closeTask() {
    setEditingId(null);
    setCachedEditing(null);
    router.replace(myWorkHref({ view, layout }), { scroll: false });
  }

  function subtitle() {
    if (view === "waiting") {
      return "Tasks across your projects that need client feedback.";
    }
    if (view === "reported") {
      return "Open tasks you raised or were marked as the reporter on.";
    }
    return "Tasks assigned to you across every project.";
  }

  return (
    <main className="app-container py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Tasks
          </p>
          <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
            My work
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{subtitle()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5"
            role="group"
            aria-label="View layout"
          >
            <Link
              href={myWorkHref({ view, layout: "list", task: editingId })}
              className={`rounded px-3 py-1.5 text-sm ${
                layout === "list"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              List
            </Link>
            <Link
              href={myWorkHref({
                view,
                layout: "calendar",
                task: editingId,
              })}
              className={`rounded px-3 py-1.5 text-sm ${
                layout === "calendar"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Calendar
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-10 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            New task
          </button>
        </div>
      </div>

      <div className="scroll-x-fade mt-5 -mx-4 flex gap-1.5 px-4 pb-1 sm:mx-0 sm:mt-6 sm:flex-wrap sm:overflow-visible sm:px-0">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={myWorkHref({ view: tab.id, layout })}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
              view === tab.id
                ? "bg-[var(--ink)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--foreground)]/15 hover:bg-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {layout === "calendar" ? (
        <div className="mt-5 sm:mt-6">
          <MyWorkCalendar
            tasks={tasks}
            todayIso={todayIso}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onTaskChange={patchTask}
            onOpenTask={(taskId) => {
              const match = tasks.find((task) => task.id === taskId);
              if (match) openTask(match);
            }}
          />
          {tasks.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {emptyCopy(view)} Use New task to add one.
            </p>
          ) : undated.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-sm font-medium">No due date</h2>
              <ul className="mt-2 max-w-3xl space-y-2">
                {undated.map((task) => (
                  <li key={task.id}>
                    <TaskWorkLink
                      title={task.title}
                      status={task.status}
                      taskType={task.task_type}
                      taskKey={task.key}
                      dueDate={task.due_date}
                      projectName={task.projectName}
                      listName={task.listName}
                      todayIso={todayIso}
                      taskId={task.id}
                      projectId={task.project_id}
                      listId={task.list_id}
                      onOpen={() => openTask(task)}
                      onTaskChange={(patch) => patchTask(task.id, patch)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 max-w-3xl sm:mt-6">
          {tasks.length === 0 ? (
            <EmptyState view={view} />
          ) : (
            <div className="space-y-6">
              {dueGroups.map((section) => (
                <section key={section.id} aria-labelledby={`due-${section.id}`}>
                  <h2
                    id={`due-${section.id}`}
                    className={`text-sm font-medium ${
                      section.id === "overdue"
                        ? "text-[var(--danger)]"
                        : ""
                    }`}
                  >
                    {section.label}
                    <span className="ml-1.5 font-normal text-[var(--muted)]">
                      {section.tasks.length}
                    </span>
                  </h2>
                  <ul className="mt-2 space-y-2">
                    {section.tasks.map((task) => (
                      <li key={task.id}>
                        <TaskWorkLink
                          title={task.title}
                          status={task.status}
                          taskType={task.task_type}
                          taskKey={task.key}
                          dueDate={task.due_date}
                          projectName={task.projectName}
                          listName={task.listName}
                          todayIso={todayIso}
                          taskId={task.id}
                          projectId={task.project_id}
                          listId={task.list_id}
                          onOpen={() => openTask(task)}
                          onTaskChange={(patch) => patchTask(task.id, patch)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {creating ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setCreating(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setCreating(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-work-task-title"
            className="relative w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg sm:rounded-xl sm:p-6"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="new-work-task-title"
                  className="font-display text-xl tracking-tight"
                >
                  New task
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Put it on a project list. You’ll be set as the assignee.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="min-h-9 min-w-9 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <HomeQuickTaskForm
                key={selectedDay ?? "no-day"}
                lists={lists}
                currentUserId={currentUserId}
                defaultDueDate={
                  layout === "calendar" ? selectedDay : null
                }
                onCreated={(taskId) => {
                  setCreating(false);
                  setEditingId(taskId);
                  router.replace(
                    myWorkHref({
                      view: "mine",
                      layout,
                      task: taskId,
                    }),
                    { scroll: false },
                  );
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <TaskModal
          key={editing.id}
          mode="edit"
          projectId={editing.project_id}
          listId={editing.list_id}
          members={membersForTask(editing, editingContext)}
          currentUserId={currentUserId}
          task={editing}
          canTrackTime={editingContext?.canTrackTime ?? false}
          isTimeAdmin={editingContext?.isTimeAdmin ?? false}
          runningEntry={runningEntry}
          contextLabel={`${editing.projectName} · ${editing.listName}`}
          contextHref={`/projects/${editing.project_id}/lists/${editing.list_id}?task=${editing.id}`}
          scheduledWeekdays={editingContext?.scheduledWeekdays ?? []}
          onClose={closeTask}
        />
      ) : null}
    </main>
  );
}

function EmptyState({ view }: { view: WorkView }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-4 py-10 text-center">
      <p className="font-medium">Nothing here</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{emptyCopy(view)}</p>
      <Link
        href="/projects"
        className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline"
      >
        Browse projects
      </Link>
    </div>
  );
}
