import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

type View = "mine" | "reported" | "overdue" | "week" | "waiting";

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

function statusLabel(status: TaskStatus) {
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

type TaskRow = {
  id: string;
  key: string | null;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  listId: string;
  listName: string;
  projectId: string;
  projectName: string;
};

async function hydrateTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{
    id: string;
    key: string | null;
    title: string;
    due_date: string | null;
    status: TaskStatus;
    list_id: string;
  }>,
): Promise<TaskRow[]> {
  const listIds = [...new Set(rows.map((row) => row.list_id))];
  const { data: lists } =
    listIds.length > 0
      ? await supabase
          .from("lists")
          .select("id, name, project_id, projects(id, name)")
          .in("id", listIds)
      : { data: [] };

  const listById = Object.fromEntries(
    (lists ?? []).map((list) => {
      const project = Array.isArray(list.projects)
        ? list.projects[0]
        : list.projects;
      return [
        list.id,
        {
          listName: list.name as string,
          projectId: (project?.id as string) ?? (list.project_id as string),
          projectName: (project?.name as string) ?? "Project",
        },
      ];
    }),
  );

  return rows.map((row) => {
    const meta = listById[row.list_id];
    return {
      id: row.id,
      key: row.key,
      title: row.title,
      due_date: row.due_date,
      status: row.status,
      listId: row.list_id,
      listName: meta?.listName ?? "List",
      projectId: meta?.projectId ?? "",
      projectName: meta?.projectName ?? "Project",
    };
  });
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = ([
    "mine",
    "reported",
    "overdue",
    "week",
    "waiting",
  ].includes(params.view ?? "")
    ? params.view
    : "mine") as View;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const today = todayIso();
  const weekEnd = endOfWeekIso();

  let tasks: TaskRow[] = [];

  if (view === "waiting") {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, key, title, due_date, status, list_id")
      .eq("status", "requiring_feedback")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });

    tasks = await hydrateTasks(
      supabase,
      (rows ?? []).map((row) => ({
        id: row.id as string,
        key: (row.key as string | null) ?? null,
        title: row.title as string,
        due_date: row.due_date as string | null,
        status: row.status as TaskStatus,
        list_id: row.list_id as string,
      })),
    );
  } else if (view === "reported") {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, key, title, due_date, status, list_id")
      .eq("reported_by", user.id)
      .neq("status", "done")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });

    tasks = await hydrateTasks(
      supabase,
      (rows ?? []).map((row) => ({
        id: row.id as string,
        key: (row.key as string | null) ?? null,
        title: row.title as string,
        due_date: row.due_date as string | null,
        status: row.status as TaskStatus,
        list_id: row.list_id as string,
      })),
    );
  } else {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, key, title, due_date, status, assigned_to, list_id")
      .eq("assigned_to", user.id)
      .neq("status", "done")
      .is("archived_at", null)
      .order("due_date", { ascending: true });

    const filtered = (rows ?? []).filter((row) => {
      const due = row.due_date as string | null;
      if (view === "mine") return true;
      if (view === "overdue") {
        return !!due && due < today;
      }
      return !!due && due >= today && due <= weekEnd;
    });

    tasks = await hydrateTasks(
      supabase,
      filtered.map((row) => ({
        id: row.id as string,
        key: (row.key as string | null) ?? null,
        title: row.title as string,
        due_date: row.due_date as string | null,
        status: row.status as TaskStatus,
        list_id: row.list_id as string,
      })),
    );
  }

  const tabs: { id: View; label: string }[] = [
    { id: "mine", label: "My tasks" },
    { id: "reported", label: "Reported by me" },
    { id: "waiting", label: "Waiting on client" },
    { id: "overdue", label: "Overdue" },
    { id: "week", label: "Due this week" },
  ];

  const emptyCopy =
    view === "mine"
      ? "When tasks are assigned to you, they’ll show up in this list."
      : view === "reported"
        ? "Tasks you reported will show up here."
        : view === "overdue"
          ? "You’re clear — no overdue assigned tasks."
          : view === "waiting"
            ? "No tasks are waiting on client feedback."
            : "No assigned tasks due through the end of this week.";

  return (
    <main className="app-container py-6 sm:py-10">
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">My work</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {view === "waiting"
            ? "Tasks across your projects that need client feedback."
            : view === "reported"
              ? "Open tasks you raised or were marked as the reporter on."
              : "Tasks assigned to you across every project."}
        </p>

        <div className="scroll-x-fade mt-6 -mx-4 flex gap-2 px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/tasks?view=${tab.id}`}
              className={`shrink-0 rounded-md px-3 py-2 text-sm ${
                view === tab.id
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <ul className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)] sm:mt-8">
          {tasks.length === 0 ? (
            <li className="px-1 py-12 text-center">
              <p className="font-medium">Nothing here</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{emptyCopy}</p>
              <Link
                href="/projects"
                className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline"
              >
                Browse projects
              </Link>
            </li>
          ) : (
            tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={
                    task.projectId
                      ? `/projects/${task.projectId}/lists/${task.listId}?task=${task.id}`
                      : "/projects"
                  }
                  className="flex flex-col gap-2 px-1 py-4 active:bg-[var(--surface)]/60 sm:flex-row sm:items-center sm:justify-between sm:gap-1 sm:hover:bg-[var(--surface)]/60"
                >
                  <div className="min-w-0">
                    {task.key ? (
                      <p className="text-xs font-medium tabular-nums tracking-wide text-[var(--muted)]">
                        {task.key}
                      </p>
                    ) : null}
                    <p className="font-medium">{task.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {task.projectName} · {task.listName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                    <span>{statusLabel(task.status)}</span>
                    <span
                      className={
                        task.due_date && task.due_date < today
                          ? "text-[var(--danger)]"
                          : ""
                      }
                    >
                      {task.due_date ? `Due ${task.due_date}` : "No due date"}
                    </span>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </main>
  );
}
