import type { ProfileOption, TaskWithPeople } from "@/components/task-modal";
import type { TaskSubtaskPreview } from "@/components/task-subtasks";
import type { TimeEntryRow } from "@/components/time-tracking-panel";
import { loadThemeDeploys } from "@/lib/load-theme-deploys";
import { personDisplayName } from "@/lib/person";
import { scheduledWeekdaysFromProject } from "@/lib/scheduled-weekdays";
import { createClient } from "@/lib/supabase/server";
import { TASK_TABLE_COLUMNS } from "@/lib/task-columns";
import type { ThemeDeploysState } from "@/lib/theme-deploy";
import type { ListVisibility, ProjectRole, Task } from "@/types/database";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ListBoardPayload = {
  list: {
    id: string;
    name: string;
    visibility: ListVisibility;
    created_by: string;
  };
  tasks: TaskWithPeople[];
  subtasksByTaskId: Record<string, TaskSubtaskPreview[]>;
  members: ProfileOption[];
  defaultAssigneeId: string | null;
  canTrackTime: boolean;
  isAdmin: boolean;
  canManageList: boolean;
  canDeleteList: boolean;
  timeSecondsByTaskId: Record<string, number>;
  runningEntry: TimeEntryRow | null;
  scheduledWeekdays: number[];
  themeDeploys: ThemeDeploysState;
};

export async function loadListBoardPayload(
  supabase: SupabaseClient,
  options: {
    projectId: string;
    listId: string;
    userId: string;
    list: {
      id: string;
      name: string;
      visibility: string;
      created_by: string;
    };
    role: ProjectRole;
    isPlatformAdmin: boolean;
    scheduledWeekdaysSource: { scheduled_weekdays?: unknown } | null;
  },
): Promise<ListBoardPayload> {
  const {
    projectId,
    listId,
    userId,
    list,
    role,
    isPlatformAdmin,
    scheduledWeekdaysSource,
  } = options;

  const isAdmin = role === "admin" || isPlatformAdmin;
  const canTrackTime =
    isPlatformAdmin || role === "admin" || role === "member";
  const canManageList =
    role === "admin" || isPlatformAdmin || list.created_by === userId;
  const canDeleteList =
    isPlatformAdmin || role === "admin" || role === "member";

  void supabase.rpc("archive_eligible_tasks", {
    p_list_id: listId,
    p_project_id: projectId,
  });

  const [{ data: memberRows }, { data: taskRows }, { data: subtaskRows }, themeDeploys] =
    await Promise.all([
      supabase
        .from("project_members")
        .select("user_id, role, profiles(id, email, full_name, deleted_at)")
        .eq("project_id", projectId),
      supabase
        .from("tasks")
        .select(TASK_TABLE_COLUMNS)
        .eq("list_id", listId)
        .is("archived_at", null)
        .order("importance", { ascending: false })
        .order("due_date", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("task_subtasks")
        .select(
          "id, task_id, title, assigned_to, due_date, completed_at, tasks!inner(list_id)",
        )
        .eq("tasks.list_id", listId)
        .order("completed_at", { ascending: true, nullsFirst: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      loadThemeDeploys(supabase, projectId),
    ]);

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
      (member) => member.role === "admin" && member.id === userId,
    )?.id ??
    activeMembers.find((member) => member.role === "admin")?.id ??
    null;

  const personIds = [
    ...new Set([
      ...(taskRows ?? []).flatMap((task) =>
        [task.created_by, task.reported_by, task.assigned_to].filter(
          (value): value is string => !!value,
        ),
      ),
      ...(subtaskRows ?? [])
        .map((subtask) => subtask.assigned_to)
        .filter((value): value is string => !!value),
    ]),
  ];

  const taskIds = (taskRows ?? []).map((task) => task.id as string);

  const [{ data: personRows }, timeTotalsResult, runningResult] =
    await Promise.all([
      personIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, email, full_name, deleted_at")
            .in("id", personIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              email: string;
              full_name: string | null;
              deleted_at: string | null;
            }[],
          }),
      canTrackTime && taskIds.length > 0
        ? supabase
            .from("time_entries")
            .select("task_id, duration_seconds")
            .in("task_id", taskIds)
            .not("ended_at", "is", null)
        : Promise.resolve({
            data: [] as { task_id: string; duration_seconds: number | null }[],
          }),
      canTrackTime
        ? supabase
            .from("time_entries")
            .select(
              "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at, profiles(full_name, email, deleted_at)",
            )
            .eq("user_id", userId)
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

  const subtasksByTaskId: Record<string, TaskSubtaskPreview[]> = {};
  for (const subtask of subtaskRows ?? []) {
    const assignee = subtask.assigned_to
      ? (profileById[subtask.assigned_to] ?? null)
      : null;
    const preview: TaskSubtaskPreview = {
      id: subtask.id,
      taskId: subtask.task_id,
      title: subtask.title,
      dueDate: subtask.due_date,
      completedAt: subtask.completed_at,
      assigneeName: assignee
        ? personDisplayName(assignee, assignee.email || "Someone")
        : null,
    };
    const group = subtasksByTaskId[subtask.task_id] ?? [];
    group.push(preview);
    subtasksByTaskId[subtask.task_id] = group;
  }

  const timeSecondsByTaskId: Record<string, number> = {};
  for (const row of timeTotalsResult.data ?? []) {
    const taskId = row.task_id as string;
    timeSecondsByTaskId[taskId] =
      (timeSecondsByTaskId[taskId] ?? 0) + (row.duration_seconds ?? 0);
  }

  return {
    list: {
      id: list.id,
      name: list.name,
      visibility: list.visibility as ListVisibility,
      created_by: list.created_by,
    },
    tasks,
    subtasksByTaskId,
    members: activeMembers,
    defaultAssigneeId,
    canTrackTime,
    isAdmin,
    canManageList,
    canDeleteList,
    timeSecondsByTaskId,
    runningEntry: (runningResult.data as TimeEntryRow | null) ?? null,
    scheduledWeekdays: scheduledWeekdaysFromProject(scheduledWeekdaysSource),
    themeDeploys,
  };
}
