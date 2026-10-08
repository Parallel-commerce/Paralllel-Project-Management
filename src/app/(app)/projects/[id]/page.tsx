import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/activity-feed";
import { AdminOnly } from "@/components/admin-only";
import { CreateListForm } from "@/components/create-list-form";
import { ListSettings } from "@/components/list-settings";
import { MembersPanel } from "@/components/members-panel";
import { ProjectClientOverview } from "@/components/project-client-overview";
import { StatusCountTag } from "@/components/status-tag";
import { TaskBoard } from "@/components/task-board";
import { requireSessionUser } from "@/lib/auth";
import { loadListBoardPayload } from "@/lib/load-list-board";
import {
  loadNextWorkTask,
  loadProjectPlanType,
} from "@/lib/project-next-work";
import { projectEngagementFromRow } from "@/lib/project-type";
import {
  TASK_STATUSES,
  type ProjectRole,
  type ProjectType,
  type TaskStatus,
} from "@/types/database";

type ListTaskStats = {
  total: number;
  byStatus: Record<TaskStatus, number>;
};

function emptyStats(): ListTaskStats {
  return {
    total: 0,
    byStatus: {
      todo: 0,
      in_progress: 0,
      requiring_feedback: 0,
      done: 0,
    },
  };
}

function ListMark({ visibility }: { visibility: string }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border ${
        visibility === "private"
          ? "border-[var(--border)] bg-[var(--surface-2)]"
          : "border-[var(--accent)]/20 bg-[var(--accent-soft)]"
      }`}
      aria-hidden
    >
      <span
        className={`h-0.5 w-5 rounded-full ${
          visibility === "private"
            ? "bg-[var(--muted)]"
            : "bg-[var(--accent)]"
        }`}
      />
      <span
        className={`h-0.5 w-5 rounded-full ${
          visibility === "private"
            ? "bg-[var(--muted)]/70"
            : "bg-[var(--accent)]/70"
        }`}
      />
      <span
        className={`h-0.5 w-3.5 rounded-full ${
          visibility === "private"
            ? "bg-[var(--muted)]/50"
            : "bg-[var(--accent)]/45"
        }`}
      />
    </span>
  );
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; reply?: string; subtask?: string }>;
}) {
  const { id } = await params;
  const {
    task: initialTaskId,
    reply: initialReplyCommentId,
    subtask: highlightSubtaskId,
  } = await searchParams;
  const { supabase, user } = await requireSessionUser();

  const [
    { data: project },
    { data: membership },
    { data: profile },
    { data: lists },
    { data: members },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, description, company_id, scheduled_weekdays, companies(id, name), project_engagement(project_type, schedule_anchor_date)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin, can_access_crm")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("lists")
      .select("id, name, visibility, created_by, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_members")
      .select("user_id, role, profiles(email, full_name)")
      .eq("project_id", id),
  ]);

  if (!project) {
    notFound();
  }

  const role = (membership?.role ?? "client") as ProjectRole;
  const isPlatformAdmin = !!profile?.is_platform_admin;
  const isAdmin = role === "admin" || isPlatformAdmin;
  const isInternal = isPlatformAdmin || role === "admin" || role === "member";
  const canViewCrm = isPlatformAdmin || !!profile?.can_access_crm;
  const engagement = isInternal
    ? projectEngagementFromRow(project.project_engagement)
    : {
        projectType: null,
        scheduleCadence: "none" as const,
        scheduleAnchorDate: new Date().toISOString().slice(0, 10),
      };
  const companyRow = Array.isArray(project.companies)
    ? project.companies[0]
    : project.companies;
  const canCreateLists =
    isPlatformAdmin ||
    role === "admin" ||
    role === "member" ||
    role === "client";

  const primaryList = lists?.[0] ?? null;
  const extraLists = (lists ?? []).slice(1);

  const [{ data: invites }, { data: statRows }, planType, nextWork, board] =
    await Promise.all([
      isAdmin
        ? supabase
            .from("project_invites")
            .select("id, email, role")
            .eq("project_id", id)
            .order("created_at", { ascending: false })
        : Promise.resolve({
            data: [] as { id: string; email: string; role: string }[],
          }),
      supabase.rpc("list_task_stats", { p_project_id: id }),
      isInternal
        ? Promise.resolve(engagement.projectType)
        : loadProjectPlanType(id),
      loadNextWorkTask(id),
      primaryList
        ? loadListBoardPayload(supabase, {
            projectId: id,
            listId: primaryList.id,
            userId: user.id,
            list: {
              id: primaryList.id,
              name: primaryList.name,
              visibility: primaryList.visibility,
              created_by: primaryList.created_by,
            },
            role,
            isPlatformAdmin,
            scheduledWeekdaysSource: project,
          })
        : Promise.resolve(null),
    ]);

  const visiblePlanType = (planType ?? engagement.projectType) as
    | ProjectType
    | null;

  const statsByList: Record<string, ListTaskStats> = {};
  for (const row of statRows ?? []) {
    const listId = row.list_id as string;
    const status = row.status as TaskStatus;
    const count = Number(row.task_count ?? 0);
    const stats = statsByList[listId] ?? emptyStats();
    if (status in stats.byStatus) {
      stats.byStatus[status] += count;
      stats.total += count;
    }
    statsByList[listId] = stats;
  }

  const memberRows =
    members?.map((m) => {
      const profileRow = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        user_id: m.user_id,
        role: m.role as ProjectRole,
        profile: profileRow
          ? {
              email: profileRow.email as string,
              full_name: (profileRow.full_name as string | null) ?? null,
            }
          : null,
      };
    }) ?? [];

  const extraListRows = extraLists.map((list) => ({
    id: list.id as string,
    name: list.name as string,
    visibility: list.visibility as string,
    stats: statsByList[list.id as string] ?? emptyStats(),
  }));

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        {project.description ? (
          <p className="text-sm text-[var(--muted)] line-clamp-2">
            {project.description}
          </p>
        ) : null}
        <p
          className={`text-xs uppercase tracking-wide text-[var(--muted)] ${
            project.description ? "mt-1" : ""
          }`}
        >
          Your role: {role}
        </p>
        {canViewCrm && companyRow ? (
          <AdminOnly variant="inline" className="mt-1">
            <p className="text-sm text-[var(--muted)]">
              Company:{" "}
              <Link
                href={`/crm/${companyRow.id}`}
                className="text-[var(--accent)] hover:underline"
              >
                {companyRow.name}
              </Link>
            </p>
          </AdminOnly>
        ) : null}
        <ProjectClientOverview
          projectId={id}
          planType={visiblePlanType}
          nextWork={nextWork}
          primaryListId={primaryList?.id ?? null}
        />
      </div>

      {board ? (
        <section className="mb-10">
          <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
                {board.list.name}
              </h2>
              <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                {board.list.visibility} list
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/projects/${id}/lists/${board.list.id}/archive`}
                className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                Archive
              </Link>
              <ListSettings
                projectId={id}
                listId={board.list.id}
                name={board.list.name}
                visibility={board.list.visibility}
                canManage={board.canManageList}
                canDelete={board.canDeleteList}
              />
            </div>
          </div>
          <TaskBoard
            projectId={id}
            listId={board.list.id}
            tasks={board.tasks}
            subtasksByTaskId={board.subtasksByTaskId}
            members={board.members}
            defaultAssigneeId={board.defaultAssigneeId}
            currentUserId={user.id}
            initialTaskId={initialTaskId ?? null}
            initialReplyCommentId={initialReplyCommentId ?? null}
            canTrackTime={board.canTrackTime}
            isTimeAdmin={board.isAdmin}
            timeSecondsByTaskId={board.timeSecondsByTaskId}
            runningEntry={board.runningEntry}
            scheduledWeekdays={board.scheduledWeekdays}
            themeDeploys={board.themeDeploys}
            allowOverbook={board.isAdmin}
            initialSubtaskId={highlightSubtaskId ?? null}
          />
        </section>
      ) : (
        <section className="mb-10">
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--column)]/60 px-6 py-12 text-center">
            <p className="font-medium">No lists yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {canCreateLists
                ? "Create a public list to share with the project, then add your first task."
                : "Ask a team member to create a list for this project."}
            </p>
          </div>
          <CreateListForm projectId={id} canCreate={canCreateLists} />
        </section>
      )}

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-medium">
              {board ? "More lists" : "Lists"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {board
                ? "Additional boards for this project. Public lists are visible to everyone; private lists are only visible to their creator and admins."
                : "Public lists are visible to everyone on this project. Private lists are only visible to their creator and admins."}
            </p>
          </div>
        </div>

        {board ? (
          <CreateListForm projectId={id} canCreate={canCreateLists} />
        ) : null}

        {extraListRows.length === 0 ? (
          board ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {canCreateLists
                ? "No other lists yet. Create one if you need a separate board."
                : "No other lists on this project."}
            </p>
          ) : null
        ) : (
          <ul className="mt-6 space-y-2">
            {extraListRows.map((list) => (
              <li key={list.id}>
                <Link
                  href={`/projects/${id}/lists/${list.id}`}
                  className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--column)]/70 px-3 py-3 transition hover:border-[var(--foreground)]/15 hover:bg-[var(--surface)] active:bg-[var(--surface)] sm:gap-4 sm:px-4 sm:py-3.5"
                >
                  <ListMark visibility={list.visibility} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium tracking-tight">
                        {list.name}
                      </p>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          list.visibility === "private"
                            ? "bg-[var(--surface-2)] text-[var(--muted)]"
                            : "bg-[var(--accent-soft)] text-[var(--accent)]"
                        }`}
                      >
                        {list.visibility}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                      {list.stats.total === 0 ? (
                        <span>No tasks yet</span>
                      ) : (
                        <>
                          <span className="font-medium text-[var(--foreground)]">
                            {list.stats.total} task
                            {list.stats.total === 1 ? "" : "s"}
                          </span>
                          {TASK_STATUSES.map((status) => {
                            const count = list.stats.byStatus[status.value];
                            if (count === 0) return null;
                            return (
                              <StatusCountTag
                                key={status.value}
                                status={status.value}
                                count={count}
                              />
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="hidden shrink-0 text-sm text-[var(--accent)] sm:inline">
                    Open
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)] sm:hidden"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <MembersPanel
          projectId={id}
          isAdmin={isAdmin}
          currentUserId={user.id}
          members={memberRows}
          invites={
            invites?.map((invite) => ({
              id: invite.id as string,
              email: invite.email as string,
              role: invite.role as ProjectRole,
            })) ?? []
          }
        />
        <ActivityFeed projectId={id} role={role} />
      </div>
    </div>
  );
}
