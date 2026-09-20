import {
  MyWorkView,
  type MyWorkTask,
  type ProjectWorkContext,
  type WorkLayout,
  type WorkView,
} from "@/components/my-work-view";
import type { HomeListOption } from "@/components/home-quick-task-form";
import type { ProfileOption } from "@/components/task-modal";
import type { TimeEntryRow } from "@/components/time-tracking-panel";
import { getCurrentProfile, requireSessionUser } from "@/lib/auth";
import { scheduledWeekdaysFromProject } from "@/lib/scheduled-weekdays";
import { TASK_TABLE_COLUMNS } from "@/lib/task-columns";
import type { ProjectRole, Task } from "@/types/database";

const TASK_COLUMNS = `${TASK_TABLE_COLUMNS}, lists(name), projects(name, scheduled_weekdays)`;

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

function nestedName(value: unknown, fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "name" in row) {
    return ((row as { name?: string | null }).name as string | null) ?? fallback;
  }
  return fallback;
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; layout?: string; task?: string }>;
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
    : "mine") as WorkView;
  const layout: WorkLayout =
    params.layout === "calendar" ? "calendar" : "list";

  const { supabase, user } = await requireSessionUser();
  const profile = await getCurrentProfile();
  const isPlatformAdmin = !!profile?.is_platform_admin;

  const today = todayIso();
  const weekEnd = endOfWeekIso();

  let taskQuery = supabase.from("tasks").select(TASK_COLUMNS).is("archived_at", null);

  if (view === "waiting") {
    taskQuery = taskQuery
      .eq("status", "requiring_feedback")
      .order("updated_at", { ascending: false });
  } else if (view === "reported") {
    taskQuery = taskQuery
      .eq("reported_by", user.id)
      .neq("status", "done")
      .order("updated_at", { ascending: false });
  } else {
    taskQuery = taskQuery
      .eq("assigned_to", user.id)
      .neq("status", "done")
      .order("due_date", { ascending: true });
  }

  const [{ data: taskRows }, { data: listRows }, { data: memberships }] =
    await Promise.all([
      taskQuery,
      supabase
        .from("lists")
        .select("id, name, project_id, projects(id, name, scheduled_weekdays)")
        .order("name", { ascending: true }),
      supabase
        .from("project_members")
        .select("project_id, role")
        .eq("user_id", user.id),
    ]);

  const filteredRows = (taskRows ?? []).filter((row) => {
    if (view === "overdue") {
      const due = row.due_date as string | null;
      return !!due && due < today;
    }
    if (view === "week") {
      const due = row.due_date as string | null;
      return !!due && due >= today && due <= weekEnd;
    }
    return true;
  });

  const personIds = [
    ...new Set(
      filteredRows.flatMap((row) =>
        [row.created_by, row.reported_by, row.assigned_to].filter(
          (value): value is string => !!value,
        ),
      ),
    ),
  ];
  const projectIds = [
    ...new Set(
      filteredRows
        .map((row) => row.project_id as string)
        .filter(Boolean),
    ),
  ];

  const [{ data: personRows }, { data: memberRows }, runningResult] =
    await Promise.all([
      personIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, email, full_name, deleted_at")
            .in("id", personIds)
        : Promise.resolve({ data: [] as ProfileOption[] }),
      projectIds.length > 0
        ? supabase
            .from("project_members")
            .select(
              "project_id, user_id, role, profiles(id, email, full_name, deleted_at)",
            )
            .in("project_id", projectIds)
        : Promise.resolve({ data: [] as Array<{
            project_id: string;
            user_id: string;
            role: ProjectRole;
            profiles: unknown;
          }> }),
      supabase
        .from("time_entries")
        .select(
          "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at, profiles(full_name, email, deleted_at)",
        )
        .eq("user_id", user.id)
        .is("ended_at", null)
        .maybeSingle(),
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

  const roleByProject = Object.fromEntries(
    (memberships ?? []).map((row) => [
      row.project_id as string,
      row.role as ProjectRole,
    ]),
  );

  const membersByProject: Record<string, ProfileOption[]> = {};
  for (const row of memberRows ?? []) {
    const profileRow = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    const member: ProfileOption = {
      id: (profileRow?.id as string) ?? row.user_id,
      email: (profileRow?.email as string) ?? "",
      full_name: (profileRow?.full_name as string | null) ?? null,
      deleted_at: (profileRow?.deleted_at as string | null) ?? null,
      role: row.role as ProjectRole,
    };
    if (member.deleted_at) continue;
    const list = membersByProject[row.project_id as string] ?? [];
    list.push(member);
    membersByProject[row.project_id as string] = list;
  }

  const scheduledWeekdaysByProject: Record<string, number[]> = {};
  for (const row of listRows ?? []) {
    const nested = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const projectId =
      (row.project_id as string) ||
      ((nested as { id?: string } | null)?.id as string | undefined) ||
      "";
    if (!projectId || projectId in scheduledWeekdaysByProject) continue;
    scheduledWeekdaysByProject[projectId] =
      scheduledWeekdaysFromProject(nested);
  }
  for (const row of filteredRows) {
    const projectId = row.project_id as string;
    if (!projectId || projectId in scheduledWeekdaysByProject) continue;
    scheduledWeekdaysByProject[projectId] = scheduledWeekdaysFromProject(
      (row as { projects?: unknown }).projects,
    );
  }

  const projectContext: Record<string, ProjectWorkContext> = {};
  for (const projectId of projectIds) {
    const role = roleByProject[projectId];
    projectContext[projectId] = {
      members: membersByProject[projectId] ?? [],
      canTrackTime:
        isPlatformAdmin || role === "admin" || role === "member",
      isTimeAdmin: isPlatformAdmin || role === "admin",
      scheduledWeekdays: scheduledWeekdaysByProject[projectId] ?? [],
    };
  }

  const tasks: MyWorkTask[] = filteredRows.map((row) => {
    const task = row as Task & { lists?: unknown; projects?: unknown };
    return {
      ...task,
      creator: profileById[task.created_by] ?? null,
      reporter: profileById[task.reported_by] ?? null,
      assignee: task.assigned_to
        ? (profileById[task.assigned_to] ?? null)
        : null,
      listName: nestedName(task.lists, "List"),
      projectName: nestedName(task.projects, "Project"),
    };
  });

  const lists: HomeListOption[] = (listRows ?? [])
    .map((row) => {
      const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      const projectId =
        (row.project_id as string) ||
        (project?.id as string | undefined) ||
        "";
      if (!projectId) return null;
      return {
        id: row.id as string,
        name: row.name as string,
        projectId,
        projectName: (project?.name as string) ?? "Project",
        scheduledWeekdays: scheduledWeekdaysFromProject(project),
      };
    })
    .filter((list): list is HomeListOption => !!list)
    .sort((a, b) => {
      const byProject = a.projectName.localeCompare(b.projectName);
      if (byProject !== 0) return byProject;
      return a.name.localeCompare(b.name);
    });

  return (
    <MyWorkView
      view={view}
      layout={layout}
      tasks={tasks}
      lists={lists}
      currentUserId={user.id}
      todayIso={today}
      initialTaskId={params.task ?? null}
      projectContext={projectContext}
      runningEntry={(runningResult.data as TimeEntryRow | null) ?? null}
    />
  );
}
