import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ListSettings } from "@/components/list-settings";
import { TaskBoard } from "@/components/task-board";
import { requireSessionUser } from "@/lib/auth";
import { loadListBoardPayload } from "@/lib/load-list-board";
import type { ProjectRole } from "@/types/database";

export default async function ListBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; listId: string }>;
  searchParams: Promise<{ task?: string; reply?: string; subtask?: string }>;
}) {
  const { id, listId } = await params;
  const {
    task: initialTaskId,
    reply: initialReplyCommentId,
    subtask: highlightSubtaskId,
  } = await searchParams;
  const { supabase, user } = await requireSessionUser();

  const [
    { data: list },
    { data: project },
    { data: membership },
    { data: profile },
    { data: firstList },
  ] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, visibility, project_id, created_by")
      .eq("id", listId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id, name, scheduled_weekdays")
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
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("lists")
      .select("id")
      .eq("project_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!list) {
    notFound();
  }

  // Primary list lives on the project page — keep deep links working.
  if (firstList?.id === listId) {
    const qs = new URLSearchParams();
    if (initialTaskId) qs.set("task", initialTaskId);
    if (initialReplyCommentId) qs.set("reply", initialReplyCommentId);
    if (highlightSubtaskId) qs.set("subtask", highlightSubtaskId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    redirect(`/projects/${id}${suffix}`);
  }

  const role = (membership?.role ?? "client") as ProjectRole;
  const isPlatformAdmin = !!profile?.is_platform_admin;

  const board = await loadListBoardPayload(supabase, {
    projectId: id,
    listId,
    userId: user.id,
    list: {
      id: list.id,
      name: list.name,
      visibility: list.visibility,
      created_by: list.created_by,
    },
    role,
    isPlatformAdmin,
    scheduledWeekdaysSource: project,
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
            {board.list.name}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            {board.list.visibility} list
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
            name={board.list.name}
            visibility={board.list.visibility}
            canManage={board.canManageList}
            canDelete={board.canDeleteList}
          />
        </div>
      </div>

      <div className="mt-8">
        <TaskBoard
          projectId={id}
          listId={listId}
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
      </div>
    </div>
  );
}
