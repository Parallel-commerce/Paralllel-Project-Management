import Link from "next/link";

import { StatusCountTag } from "@/components/status-tag";
import { TaskWorkLink } from "@/components/task-work-link";
import { personDisplayName } from "@/lib/person";
import { createClient } from "@/lib/supabase/server";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

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

function emptyStatusCounts(): Record<TaskStatus, number> {
  return {
    todo: 0,
    in_progress: 0,
    requiring_feedback: 0,
    done: 0,
  };
}

type AttentionTask = {
  id: string;
  key: string | null;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  list_id: string;
  project_id: string;
  projectName: string;
  listName: string;
  reason: "overdue" | "feedback";
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string;
  deleted_at: string | null;
};

export async function AdminHomeInsights() {
  const supabase = await createClient();
  const today = todayIso();

  const [{ data: projects }, loginStatusResult] = await Promise.all([
    supabase.from("projects").select("id, name"),
    supabase.rpc("list_user_login_status"),
  ]);

  const projectIds = (projects ?? []).map((p) => p.id);
  const projectNameById = new Map(
    (projects ?? []).map((p) => [p.id, p.name as string]),
  );

  const [
    statsResult,
    overdueCountResult,
    overdueTasksResult,
    feedbackTasksResult,
    activityResult,
  ] = await Promise.all([
    projectIds.length > 0
      ? supabase.rpc("project_task_stats", { p_project_ids: projectIds })
      : Promise.resolve({
          data: [] as {
            project_id: string;
            status: TaskStatus;
            task_count: number;
          }[],
        }),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .neq("status", "done")
      .not("due_date", "is", null)
      .lt("due_date", today),
    supabase
      .from("tasks")
      .select("id, key, title, due_date, status, list_id, project_id")
      .is("archived_at", null)
      .neq("status", "done")
      .not("due_date", "is", null)
      .lt("due_date", today)
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("tasks")
      .select("id, key, title, due_date, status, list_id, project_id")
      .is("archived_at", null)
      .eq("status", "requiring_feedback")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("activity_events")
      .select("id, summary, created_at, project_id, actor_id")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const byStatus = emptyStatusCounts();
  for (const row of statsResult.data ?? []) {
    const status = row.status as TaskStatus;
    if (status in byStatus) {
      byStatus[status] += Number(row.task_count ?? 0);
    }
  }

  const overdueCount = overdueCountResult.count ?? 0;
  const openTotal =
    byStatus.todo + byStatus.in_progress + byStatus.requiring_feedback;

  const attentionSeed = [
    ...(overdueTasksResult.data ?? []),
    ...(feedbackTasksResult.data ?? []),
  ];

  const listIds = [
    ...new Set(attentionSeed.map((row) => row.list_id as string)),
  ];
  const actorIds = [
    ...new Set(
      (activityResult.data ?? [])
        .map((row) => row.actor_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const [{ data: listRows }, { data: actorProfiles }] =
    await Promise.all([
      listIds.length > 0
        ? supabase.from("lists").select("id, name").in("id", listIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      actorIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, full_name, email, deleted_at")
            .in("id", actorIds)
        : Promise.resolve({ data: [] as ProfileLite[] }),
    ]);

  const listNameById = new Map(
    (listRows ?? []).map((row) => [row.id, row.name as string]),
  );
  const actorById = new Map(
    (actorProfiles ?? []).map((row) => [row.id as string, row as ProfileLite]),
  );

  const attentionMap = new Map<string, AttentionTask>();

  for (const row of overdueTasksResult.data ?? []) {
    attentionMap.set(row.id as string, {
      id: row.id as string,
      key: (row.key as string | null) ?? null,
      title: row.title as string,
      due_date: (row.due_date as string | null) ?? null,
      status: row.status as TaskStatus,
      list_id: row.list_id as string,
      project_id: row.project_id as string,
      projectName: projectNameById.get(row.project_id as string) ?? "Project",
      listName: listNameById.get(row.list_id as string) ?? "List",
      reason: "overdue",
    });
  }

  for (const row of feedbackTasksResult.data ?? []) {
    const id = row.id as string;
    if (attentionMap.has(id)) continue;
    attentionMap.set(id, {
      id,
      key: (row.key as string | null) ?? null,
      title: row.title as string,
      due_date: (row.due_date as string | null) ?? null,
      status: row.status as TaskStatus,
      list_id: row.list_id as string,
      project_id: row.project_id as string,
      projectName: projectNameById.get(row.project_id as string) ?? "Project",
      listName: listNameById.get(row.list_id as string) ?? "List",
      reason: "feedback",
    });
  }

  const attentionTasks = [...attentionMap.values()]
    .sort((a, b) => {
      if (a.reason !== b.reason) {
        return a.reason === "overdue" ? -1 : 1;
      }
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 5);

  const neverLoggedIn = (loginStatusResult.data ?? []).filter(
    (row) => row.auth_status === "never_logged_in",
  ).length;
  const activeSessions = (loginStatusResult.data ?? []).filter(
    (row) => row.has_active_session,
  ).length;

  const activity = (activityResult.data ?? []).map((row) => {
    const actor = row.actor_id
      ? actorById.get(row.actor_id as string) ?? null
      : null;
    return {
      id: row.id as string,
      summary: row.summary as string,
      created_at: row.created_at as string,
      projectId: row.project_id as string,
      projectName: projectNameById.get(row.project_id as string) ?? "Project",
      actorName: personDisplayName(actor, "Someone"),
    };
  });

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Operations</h2>
          <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
            Across all projects — what needs attention and what&apos;s moving.
          </p>
        </div>
        <Link
          href="/users"
          className="shrink-0 text-sm text-[var(--accent)] hover:underline"
        >
          Users
        </Link>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 px-4 py-3.5 sm:px-5 sm:py-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div>
            <dt className="text-xs text-[var(--muted)]">Open work</dt>
            <dd className="mt-1 text-xl font-medium tabular-nums tracking-tight">
              {openTotal}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Overdue</dt>
            <dd
              className={`mt-1 text-xl font-medium tabular-nums tracking-tight ${
                overdueCount > 0 ? "text-[var(--danger)]" : ""
              }`}
            >
              {overdueCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Never signed in</dt>
            <dd className="mt-1 text-xl font-medium tabular-nums tracking-tight">
              {neverLoggedIn}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Active sessions</dt>
            <dd className="mt-1 text-xl font-medium tabular-nums tracking-tight">
              {activeSessions}
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3 sm:mt-4 sm:pt-4">
          {TASK_STATUSES.filter((s) => s.value !== "done").map((status) => (
            <StatusCountTag
              key={status.value}
              status={status.value}
              count={byStatus[status.value]}
            />
          ))}
          {byStatus.done > 0 ? (
            <StatusCountTag status="done" count={byStatus.done} />
          ) : null}
          {openTotal === 0 && byStatus.done === 0 ? (
            <span className="text-xs text-[var(--muted)]">No tasks yet</span>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {neverLoggedIn > 0 ? (
            <>
              <span className="font-medium text-[var(--foreground)]">
                {neverLoggedIn}
              </span>{" "}
              {neverLoggedIn === 1 ? "person has" : "people have"} never signed
              in.{" "}
              <Link
                href="/users"
                className="text-[var(--accent)] hover:underline"
              >
                Review on Users
              </Link>
            </>
          ) : (
            <>
              Everyone with access has signed in at least once.{" "}
              <Link
                href="/users"
                className="text-[var(--accent)] hover:underline"
              >
                Manage users
              </Link>
            </>
          )}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">Needs attention</h3>
        <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
          Overdue work and tasks waiting on feedback.
        </p>
        <ul className="mt-2.5 space-y-2 sm:mt-3">
          {attentionTasks.length === 0 ? (
            <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--muted)] sm:py-6">
              No overdue or feedback tasks.
            </li>
          ) : (
            attentionTasks.map((task) => (
              <li key={task.id}>
                <TaskWorkLink
                  href={`/projects/${task.project_id}/lists/${task.list_id}?task=${task.id}`}
                  title={task.title}
                  status={task.status}
                  taskKey={task.key}
                  dueDate={task.due_date}
                  projectName={task.projectName}
                  listName={task.listName}
                  todayIso={today}
                />
              </li>
            ))
          )}
        </ul>
      </div>

      <details className="group border-y border-[var(--border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
          <span>
            Recent activity
            {activity.length > 0 ? (
              <span className="ml-2 font-normal text-[var(--muted)]">
                {activity.length}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden
            className="text-[var(--muted)] transition group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <ul className="mb-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {activity.length === 0 ? (
            <li className="px-1 py-5 text-sm text-[var(--muted)]">
              No activity yet.
            </li>
          ) : (
            activity.map((event) => (
              <li key={event.id} className="px-1 py-3 sm:py-3.5">
                <p className="text-sm">{event.summary}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {event.actorName} ·{" "}
                  <Link
                    href={`/projects/${event.projectId}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {event.projectName}
                  </Link>{" "}
                  · {formatWhen(event.created_at)}
                </p>
              </li>
            ))
          )}
        </ul>
      </details>
    </section>
  );
}
