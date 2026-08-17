import Link from "next/link";

import { personDisplayName } from "@/lib/person";
import { createClient } from "@/lib/supabase/server";

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

function truncate(text: string, max = 160) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function nestOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type RecentComment = {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  isClient: boolean;
  taskId: string;
  taskKey: string | null;
  taskTitle: string;
  listId: string;
  projectId: string;
  projectName: string;
};

export async function RecentComments({
  limit = 8,
}: {
  limit?: number;
}) {
  const supabase = await createClient();

  const { data: commentRows } = await supabase
    .from("task_comments")
    .select(
      "id, body, created_at, created_by, task_id, profiles(id, full_name, email, deleted_at)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 24));

  const taskIds = [
    ...new Set((commentRows ?? []).map((row) => row.task_id as string)),
  ];

  const { data: tasks } =
    taskIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, key, title, list_id, project_id, projects(name)")
          .in("id", taskIds)
      : { data: [] as {
          id: string;
          key: string;
          title: string;
          list_id: string;
          project_id: string;
          projects: { name: string } | { name: string }[] | null;
        }[] };

  const taskById = new Map(
    (tasks ?? []).map((task) => [task.id as string, task]),
  );

  const membershipKeys = new Map<string, { projectId: string; userId: string }>();
  for (const row of commentRows ?? []) {
    const task = taskById.get(row.task_id as string);
    if (!task) continue;
    const userId = row.created_by as string;
    const projectId = task.project_id as string;
    membershipKeys.set(`${projectId}:${userId}`, { projectId, userId });
  }

  const membershipList = [...membershipKeys.values()];
  const projectIds = [...new Set(membershipList.map((item) => item.projectId))];
  const userIds = [...new Set(membershipList.map((item) => item.userId))];

  const { data: memberships } =
    projectIds.length > 0 && userIds.length > 0
      ? await supabase
          .from("project_members")
          .select("project_id, user_id, role")
          .in("project_id", projectIds)
          .in("user_id", userIds)
      : { data: [] as { project_id: string; user_id: string; role: string }[] };

  const roleByPair = new Map(
    (memberships ?? []).map((row) => [
      `${row.project_id}:${row.user_id}`,
      row.role as string,
    ]),
  );

  const comments: RecentComment[] = [];
  for (const row of commentRows ?? []) {
    const task = taskById.get(row.task_id as string);
    if (!task) continue;
    const author = nestOne(row.profiles);
    const project = nestOne(task.projects);
    const role =
      roleByPair.get(`${task.project_id}:${row.created_by as string}`) ?? null;
    comments.push({
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
      isClient: role === "client",
      taskId: task.id as string,
      taskKey: (task.key as string | null) ?? null,
      taskTitle: task.title as string,
      listId: task.list_id as string,
      projectId: task.project_id as string,
      projectName: (project?.name as string) ?? "Project",
    });
  }

  const sorted = [...comments].sort((a, b) => {
    if (a.isClient !== b.isClient) return a.isClient ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });

  const visible = sorted.slice(0, limit);
  const clientCount = visible.filter((comment) => comment.isClient).length;

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Recent comments</h2>
          <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
            Latest discussion across your projects
            {clientCount > 0
              ? " — client comments are listed first."
              : "."}
          </p>
        </div>
        {clientCount > 0 ? (
          <span className="shrink-0 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent)]">
            {clientCount} client
            {clientCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:mt-4">
        {visible.length === 0 ? (
          <li className="px-4 py-6 text-sm text-[var(--muted)] sm:py-8">
            No comments yet. When clients reply on tasks, they&apos;ll show up
            here.
          </li>
        ) : (
          visible.map((comment) => (
            <li key={comment.id}>
              <Link
                href={`/projects/${comment.projectId}/lists/${comment.listId}?task=${comment.taskId}`}
                className="block px-4 py-3 transition hover:bg-[var(--surface-2)]/70 sm:py-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{comment.authorName}</p>
                  {comment.isClient ? (
                    <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                      Client
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]">
                  {truncate(comment.body)}
                </p>
                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  {comment.taskKey ? `${comment.taskKey} · ` : ""}
                  {comment.taskTitle} · {comment.projectName} ·{" "}
                  {formatWhen(comment.created_at)}
                </p>
              </Link>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
