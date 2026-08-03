import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ListSettings } from "@/components/list-settings";
import { TaskBoard } from "@/components/task-board";
import type { TimeEntryRow } from "@/components/time-tracking-panel";
import { createClient } from "@/lib/supabase/server";
import type {
  ListVisibility,
  ProjectRole,
  Task,
  TaskAttachment,
} from "@/types/database";

export default async function ListBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; listId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { id, listId } = await params;
  const { task: initialTaskId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: list } = await supabase
    .from("lists")
    .select("id, name, visibility, project_id, created_by")
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

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const role = (membership?.role ?? "client") as ProjectRole;
  const isPlatformAdmin = !!profile?.is_platform_admin;
  const isAdmin = role === "admin" || isPlatformAdmin;
  const canTrackTime =
    isPlatformAdmin || role === "admin" || role === "member";
  const canManageList = role === "admin" || list.created_by === user.id;

  const { data: memberRows } = await supabase
    .from("project_members")
    .select("user_id, profiles(id, email, full_name)")
    .eq("project_id", id);

  const members =
    memberRows?.map((row) => {
      const profileRow = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      return {
        id: (profileRow?.id as string) ?? row.user_id,
        email: (profileRow?.email as string) ?? "",
        full_name: (profileRow?.full_name as string | null) ?? null,
      };
    }) ?? [];

  const profileById = Object.fromEntries(members.map((m) => [m.id, m]));

  await supabase.rpc("archive_eligible_tasks", {
    p_list_id: listId,
    p_project_id: id,
  });

  const { data: taskRows } = await supabase
    .from("tasks")
    .select(
      "id, list_id, project_id, title, description, due_date, status, link_url, number, key, created_by, reported_by, assigned_to, completed_at, archived_at, created_at, updated_at",
    )
    .eq("list_id", listId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const tasks =
    (taskRows as Task[] | null)?.map((task) => ({
      ...task,
      creator: profileById[task.created_by] ?? null,
      reporter: profileById[task.reported_by] ?? null,
      assignee: task.assigned_to
        ? (profileById[task.assigned_to] ?? null)
        : null,
    })) ?? [];

  const taskIds = tasks.map((task) => task.id);
  const { data: attachmentRows } =
    taskIds.length > 0
      ? await supabase
          .from("task_attachments")
          .select(
            "id, task_id, file_path, file_name, content_type, size_bytes, uploaded_by, created_at",
          )
          .in("task_id", taskIds)
          .order("created_at", { ascending: true })
      : { data: [] };

  const attachmentsByTaskId: Record<string, TaskAttachment[]> = {};
  for (const row of (attachmentRows ?? []) as TaskAttachment[]) {
    const listForTask = attachmentsByTaskId[row.task_id] ?? [];
    listForTask.push(row);
    attachmentsByTaskId[row.task_id] = listForTask;
  }

  const timeEntriesByTaskId: Record<string, TimeEntryRow[]> = {};
  let runningEntry: TimeEntryRow | null = null;

  if (canTrackTime && taskIds.length > 0) {
    const [{ data: timeRows }, { data: running }] = await Promise.all([
      supabase
        .from("time_entries")
        .select(
          "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at, profiles(full_name, email)",
        )
        .in("task_id", taskIds)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false }),
      supabase
        .from("time_entries")
        .select(
          "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at, profiles(full_name, email)",
        )
        .eq("user_id", user.id)
        .is("ended_at", null)
        .maybeSingle(),
    ]);

    for (const row of (timeRows ?? []) as TimeEntryRow[]) {
      const bucket = timeEntriesByTaskId[row.task_id] ?? [];
      bucket.push(row);
      timeEntriesByTaskId[row.task_id] = bucket;
    }
    runningEntry = (running as TimeEntryRow | null) ?? null;
  }

  return (
    <div className="app-shell min-h-full">
      <AppHeader />
      <main className="app-container py-6 sm:py-10">
        <Link
          href={`/projects/${id}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← {project?.name ?? "Project"}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
              {list.name}
            </h1>
            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
              {list.visibility} list
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${id}/lists/${listId}/archive`}
              className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
            >
              Archive
            </Link>
            <ListSettings
              projectId={id}
              listId={listId}
              name={list.name}
              visibility={list.visibility as ListVisibility}
              canManage={canManageList}
            />
          </div>
        </div>

        <div className="mt-8">
          <TaskBoard
            projectId={id}
            listId={listId}
            tasks={tasks}
            members={members}
            currentUserId={user.id}
            initialTaskId={initialTaskId ?? null}
            attachmentsByTaskId={attachmentsByTaskId}
            canTrackTime={canTrackTime}
            isTimeAdmin={isAdmin}
            timeEntriesByTaskId={timeEntriesByTaskId}
            runningEntry={runningEntry}
          />
        </div>
      </main>
    </div>
  );
}
