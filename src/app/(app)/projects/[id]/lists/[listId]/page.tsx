import Link from "next/link";
import { notFound } from "next/navigation";

import { ListSettings } from "@/components/list-settings";
import { TaskBoard } from "@/components/task-board";
import type { TimeEntryRow } from "@/components/time-tracking-panel";
import { requireSessionUser } from "@/lib/auth";
import type { ListVisibility, ProjectRole, Task } from "@/types/database";

export default async function ListBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; listId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { id, listId } = await params;
  const { task: initialTaskId } = await searchParams;
  const { supabase, user } = await requireSessionUser();

  const [
    { data: list },
    { data: project },
    { data: membership },
    { data: profile },
    { data: memberRows },
  ] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, visibility, project_id, created_by")
      .eq("id", listId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
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
    supabase
      .from("project_members")
      .select("user_id, role, profiles(id, email, full_name, deleted_at)")
      .eq("project_id", id),
  ]);

  if (!list) {
    notFound();
  }

  // Archive in the background — don't block board paint
  void supabase.rpc("archive_eligible_tasks", {
    p_list_id: listId,
    p_project_id: id,
  });

  const role = (membership?.role ?? "client") as ProjectRole;
  const isPlatformAdmin = !!profile?.is_platform_admin;
  const isAdmin = role === "admin" || isPlatformAdmin;
  const canTrackTime =
    isPlatformAdmin || role === "admin" || role === "member";
  const canManageList =
    role === "admin" || isPlatformAdmin || list.created_by === user.id;
  const canDeleteList =
    isPlatformAdmin || role === "admin" || role === "member";

  const members =
    memberRows?.map((row) => {
      const profileRow = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      return {
        id: (profileRow?.id as string) ?? row.user_id,
        email: (profileRow?.email as string) ?? "",
        full_name: (profileRow?.full_name as string | null) ?? null,
        deleted_at: (profileRow?.deleted_at as string | null) ?? null,
        role: row.role as ProjectRole,
      };
    }) ?? [];

  const activeMembers = members.filter((member) => !member.deleted_at);
  const defaultAssigneeId =
    activeMembers.find(
      (member) => member.role === "admin" && member.id === user.id,
    )?.id ??
    activeMembers.find((member) => member.role === "admin")?.id ??
    null;

  const { data: taskRows } = await supabase
    .from("tasks")
    .select(
      "id, list_id, project_id, title, description, due_date, status, link_url, number, key, created_by, reported_by, assigned_to, completed_at, archived_at, created_at, updated_at",
    )
    .eq("list_id", listId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const personIds = [
    ...new Set(
      (taskRows ?? []).flatMap((task) =>
        [task.created_by, task.reported_by, task.assigned_to].filter(
          (value): value is string => !!value,
        ),
      ),
    ),
  ];

  const taskIds = (taskRows ?? []).map((task) => task.id as string);

  const [{ data: personRows }, timeTotalsResult, runningResult] =
    await Promise.all([
      personIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, email, full_name, deleted_at")
            .in("id", personIds)
        : Promise.resolve({ data: [] as {
            id: string;
            email: string;
            full_name: string | null;
            deleted_at: string | null;
          }[] }),
      canTrackTime && taskIds.length > 0
        ? supabase
            .from("time_entries")
            .select("task_id, duration_seconds")
            .in("task_id", taskIds)
            .not("ended_at", "is", null)
        : Promise.resolve({ data: [] as { task_id: string; duration_seconds: number | null }[] }),
      canTrackTime
        ? supabase
            .from("time_entries")
            .select(
              "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at, profiles(full_name, email, deleted_at)",
            )
            .eq("user_id", user.id)
            .is("ended_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const profileById = Object.fromEntries(
    (personRows ?? []).map((person) => [
      person.id,
      {
        id: person.id as string,
        email: person.email as string,
        full_name: (person.full_name as string | null) ?? null,
        deleted_at: (person.deleted_at as string | null) ?? null,
      },
    ]),
  );

  const tasks =
    (taskRows as Task[] | null)?.map((task) => ({
      ...task,
      creator: profileById[task.created_by] ?? null,
      reporter: profileById[task.reported_by] ?? null,
      assignee: task.assigned_to
        ? (profileById[task.assigned_to] ?? null)
        : null,
    })) ?? [];

  const timeSecondsByTaskId: Record<string, number> = {};
  for (const row of timeTotalsResult.data ?? []) {
    const taskId = row.task_id as string;
    timeSecondsByTaskId[taskId] =
      (timeSecondsByTaskId[taskId] ?? 0) + (row.duration_seconds ?? 0);
  }

  return (
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
            canDelete={canDeleteList}
          />
        </div>
      </div>

      <div className="mt-8">
        <TaskBoard
          projectId={id}
          listId={listId}
          tasks={tasks}
          members={activeMembers}
          defaultAssigneeId={defaultAssigneeId}
          currentUserId={user.id}
          initialTaskId={initialTaskId ?? null}
          canTrackTime={canTrackTime}
          isTimeAdmin={isAdmin}
          timeSecondsByTaskId={timeSecondsByTaskId}
          runningEntry={(runningResult.data as TimeEntryRow | null) ?? null}
        />
      </div>
    </main>
  );
}
