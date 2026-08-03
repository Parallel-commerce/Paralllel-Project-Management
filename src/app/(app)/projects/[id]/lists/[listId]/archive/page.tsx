import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { RestoreArchivedTaskButton } from "@/components/restore-archived-task-button";
import { createClient } from "@/lib/supabase/server";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

function statusLabel(status: TaskStatus) {
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ListArchivePage({
  params,
}: {
  params: Promise<{ id: string; listId: string }>;
}) {
  const { id, listId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: list } = await supabase
    .from("lists")
    .select("id, name, visibility, project_id")
    .eq("id", listId)
    .eq("project_id", id)
    .maybeSingle();

  if (!list) {
    notFound();
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  await supabase.rpc("archive_eligible_tasks", {
    p_list_id: listId,
    p_project_id: id,
  });

  const [{ data: memberRows }, { data: taskRows }] = await Promise.all([
    supabase
      .from("project_members")
      .select("user_id, profiles(id, email, full_name)")
      .eq("project_id", id),
    supabase
      .from("tasks")
      .select(
        "id, key, title, status, due_date, assigned_to, completed_at, archived_at, updated_at",
      )
      .eq("list_id", listId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false }),
  ]);

  const profileById = Object.fromEntries(
    (memberRows ?? []).map((row) => {
      const profileRow = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      const name =
        (profileRow?.full_name as string | null) ||
        (profileRow?.email as string | null) ||
        "Someone";
      return [row.user_id as string, name];
    }),
  );

  const tasks = taskRows ?? [];

  return (
    <div className="app-shell min-h-full">
      <AppHeader />
      <main className="app-container py-6 sm:py-10">
        <Link
          href={`/projects/${id}/lists/${listId}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← {list.name}
        </Link>
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {project?.name ?? "Project"}
          </p>
          <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
            Archive
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Tasks move here automatically after they&apos;ve been Done for 30
            days. They stay searchable here, but leave the board.
          </p>
        </div>

        <ul className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {tasks.length === 0 ? (
            <li className="px-1 py-12 text-center">
              <p className="font-medium">No archived tasks</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Completed work older than 30 days will show up here.
              </p>
            </li>
          ) : (
            tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-col gap-3 px-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  {task.key ? (
                    <p className="text-xs font-medium tabular-nums tracking-wide text-[var(--muted)]">
                      {task.key}
                    </p>
                  ) : null}
                  <p className="font-medium">{task.title}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                    <span>{statusLabel(task.status as TaskStatus)}</span>
                    <span>
                      Completed {formatDate(task.completed_at as string | null)}
                    </span>
                    <span>
                      Archived {formatDate(task.archived_at as string | null)}
                    </span>
                    {task.assigned_to ? (
                      <span>
                        Assigned ·{" "}
                        {profileById[task.assigned_to as string] ?? "Someone"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <RestoreArchivedTaskButton
                  projectId={id}
                  listId={listId}
                  taskId={task.id as string}
                />
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}
