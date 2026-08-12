import Link from "next/link";
import { format, parseISO } from "date-fns";

import { StatusCountTag, StatusTag } from "@/components/status-tag";
import { personDisplayName } from "@/lib/person";
import { createClient } from "@/lib/supabase/server";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDue(value: string | null) {
  if (!value) return null;
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM yyyy");
  } catch {
    return value;
  }
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

function truncate(text: string, max = 140) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
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

function nestOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

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
    commentsResult,
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
      .limit(8),
    supabase
      .from("tasks")
      .select("id, key, title, due_date, status, list_id, project_id")
      .is("archived_at", null)
      .eq("status", "requiring_feedback")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("task_comments")
      .select(
        "id, body, created_at, created_by, task_id, profiles(id, full_name, email, deleted_at)",
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("activity_events")
      .select("id, summary, created_at, project_id, actor_id")
      .order("created_at", { ascending: false })
      .limit(12),
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
  const commentTaskIds = [
    ...new Set(
      (commentsResult.data ?? []).map((row) => row.task_id as string),
    ),
  ];
  const actorIds = [
    ...new Set(
      (activityResult.data ?? [])
        .map((row) => row.actor_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const [{ data: listRows }, { data: commentTasks }, { data: actorProfiles }] =
    await Promise.all([
      listIds.length > 0
        ? supabase.from("lists").select("id, name").in("id", listIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      commentTaskIds.length > 0
        ? supabase
            .from("tasks")
            .select("id, key, title, list_id, project_id")
            .in("id", commentTaskIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              key: string;
              title: string;
              list_id: string;
              project_id: string;
            }[],
          }),
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
  const commentTaskById = new Map(
    (commentTasks ?? []).map((row) => [row.id as string, row]),
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
    .slice(0, 8);

  const neverLoggedIn = (loginStatusResult.data ?? []).filter(
    (row) => row.auth_status === "never_logged_in",
  ).length;
  const activeSessions = (loginStatusResult.data ?? []).filter(
    (row) => row.has_active_session,
  ).length;

  const comments = (commentsResult.data ?? []).flatMap((row) => {
    const task = commentTaskById.get(row.task_id as string);
    if (!task) return [];
    const author = nestOne(row.profiles);
    return [
      {
        id: row.id as string,
        body: row.body as string,
        created_at: row.created_at as string,
        authorName: personDisplayName(
          {
            full_name: author?.full_name ?? null,
            email: author?.email ?? null,
            deleted_at: author?.deleted_at ?? null,
          },
          "Someone",
        ),
        taskId: task.id as string,
        taskKey: (task.key as string | null) ?? null,
        taskTitle: task.title as string,
        listId: task.list_id as string,
        projectId: task.project_id as string,
        projectName: projectNameById.get(task.project_id as string) ?? "Project",
      },
    ];
  });

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
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Operations</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
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

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 px-4 py-4 sm:px-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-4">
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
      </div>

      <div>
        <h3 className="text-sm font-medium">Needs attention</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Overdue work and tasks waiting on feedback.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {attentionTasks.length === 0 ? (
            <li className="px-1 py-6 text-sm text-[var(--muted)]">
              No overdue or feedback tasks.
            </li>
          ) : (
            attentionTasks.map((task) => {
              const due = formatDue(task.due_date);
              return (
                <li key={task.id}>
                  <Link
                    href={`/projects/${task.project_id}/lists/${task.list_id}?task=${task.id}`}
                    className="flex flex-col gap-1 px-1 py-3.5 hover:bg-[var(--surface)]/60 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      {task.key ? (
                        <p className="text-xs font-medium tabular-nums tracking-wide text-[var(--muted)]">
                          {task.key}
                        </p>
                      ) : null}
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                        {task.projectName} · {task.listName}
                        {task.reason === "overdue" ? " · Overdue" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-[var(--muted)]">
                      <StatusTag status={task.status} />
                      {due ? (
                        <span
                          className={
                            task.reason === "overdue"
                              ? "text-[var(--danger)]"
                              : ""
                          }
                        >
                          {due}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium">Recent comments</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Latest discussion across projects.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {comments.length === 0 ? (
            <li className="px-1 py-6 text-sm text-[var(--muted)]">
              No comments yet.
            </li>
          ) : (
            comments.map((comment) => (
              <li key={comment.id}>
                <Link
                  href={`/projects/${comment.projectId}/lists/${comment.listId}?task=${comment.taskId}`}
                  className="block px-1 py-3.5 hover:bg-[var(--surface)]/60"
                >
                  <p className="text-sm leading-relaxed">
                    {truncate(comment.body)}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--muted)]">
                    {comment.authorName}
                    {comment.taskKey ? ` · ${comment.taskKey}` : ""} ·{" "}
                    {comment.taskTitle} · {comment.projectName} ·{" "}
                    {formatWhen(comment.created_at)}
                  </p>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium">People</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sign-in health across the workspace.
        </p>
        <div className="mt-3 border-y border-[var(--border)] px-1 py-4 text-sm">
          {neverLoggedIn > 0 ? (
            <p>
              <span className="font-medium">{neverLoggedIn}</span>{" "}
              {neverLoggedIn === 1 ? "person has" : "people have"} been invited
              but never signed in.{" "}
              <Link
                href="/users"
                className="text-[var(--accent)] hover:underline"
              >
                Review on Users
              </Link>
            </p>
          ) : (
            <p className="text-[var(--muted)]">
              Everyone with access has signed in at least once.{" "}
              <Link
                href="/users"
                className="text-[var(--accent)] hover:underline"
              >
                Manage users
              </Link>
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Recent activity</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Creates, status moves, comments, and invites.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {activity.length === 0 ? (
            <li className="px-1 py-6 text-sm text-[var(--muted)]">
              No activity yet.
            </li>
          ) : (
            activity.map((event) => (
              <li key={event.id} className="px-1 py-3.5">
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
      </div>
    </section>
  );
}
