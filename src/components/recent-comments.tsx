import { getSessionUser } from "@/lib/auth";
import { personDisplayName } from "@/lib/person";
import { createClient } from "@/lib/supabase/server";

import { RecentCommentsList, type RecentCommentItem } from "./recent-comments-list";

function nestOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function RecentComments({
  limit = 8,
}: {
  limit?: number;
}) {
  const [{ user }, supabase] = await Promise.all([
    getSessionUser(),
    createClient(),
  ]);

  if (!user) {
    return null;
  }

  const { data: commentRows } = await supabase
    .from("task_comments")
    .select(
      "id, body, created_at, created_by, task_id, parent_id, profiles!task_comments_created_by_fkey(id, full_name, email, deleted_at)",
    )
    .neq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 6, 40));

  const candidateIds = (commentRows ?? []).map((row) => row.id as string);
  if (candidateIds.length === 0) {
    return <RecentCommentsList comments={[]} />;
  }

  const [
    { data: tasks },
    { data: myReplies },
    { data: readRows },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, key, title, list_id, project_id, projects(name)")
      .in(
        "id",
        [...new Set((commentRows ?? []).map((row) => row.task_id as string))],
      ),
    supabase
      .from("task_comments")
      .select("parent_id")
      .eq("created_by", user.id)
      .in("parent_id", candidateIds),
    supabase
      .from("task_comment_reads")
      .select("comment_id")
      .eq("user_id", user.id)
      .in("comment_id", candidateIds),
  ]);

  const taskById = new Map(
    (tasks ?? []).map((task) => [task.id as string, task]),
  );
  const repliedParentIds = new Set(
    (myReplies ?? [])
      .map((row) => row.parent_id as string | null)
      .filter((id): id is string => !!id),
  );
  const readIds = new Set(
    (readRows ?? []).map((row) => row.comment_id as string),
  );

  const openRows = (commentRows ?? []).filter((row) => {
    const id = row.id as string;
    if (repliedParentIds.has(id)) return false;
    if (readIds.has(id)) return false;
    return !!taskById.get(row.task_id as string);
  });

  const membershipKeys = new Map<string, { projectId: string; userId: string }>();
  for (const row of openRows) {
    const task = taskById.get(row.task_id as string);
    if (!task) continue;
    membershipKeys.set(`${task.project_id}:${row.created_by}`, {
      projectId: task.project_id as string,
      userId: row.created_by as string,
    });
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

  const comments: RecentCommentItem[] = [];
  for (const row of openRows) {
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

  return <RecentCommentsList comments={visible} />;
}
