"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  resolveMentionedUserIds,
  type MentionPerson,
} from "@/lib/mentions";
import { logActivity, notifyUser } from "@/lib/notify";
import { profileAvatarPublicUrl } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

export type CommentAuthor = {
  id: string;
  email: string;
  full_name: string | null;
  deleted_at: string | null;
  avatar_url: string | null;
};

export type CommentWithAuthor = {
  id: string;
  task_id: string;
  parent_id: string | null;
  body: string;
  created_by: string;
  created_at: string;
  author: CommentAuthor | null;
};

function mapAuthor(
  profile:
    | {
        id: string;
        email: string;
        full_name: string | null;
        deleted_at?: string | null;
        avatar_path: string | null;
        updated_at?: string;
      }
    | null
    | undefined,
): CommentAuthor | null {
  if (!profile) return null;
  const baseUrl = profile.deleted_at
    ? null
    : profileAvatarPublicUrl(profile.avatar_path);
  const avatarUrl = baseUrl
    ? `${baseUrl}?v=${encodeURIComponent(profile.updated_at ?? "")}`
    : null;
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    deleted_at: profile.deleted_at ?? null,
    avatar_url: avatarUrl,
  };
}

export async function listTaskComments(
  taskId: string,
): Promise<{ comments: CommentWithAuthor[]; error?: string }> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("task_comments")
    .select(
      "id, task_id, parent_id, body, created_by, created_at, profiles!task_comments_created_by_fkey(id, email, full_name, deleted_at, avatar_path, updated_at)",
    )
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    return { comments: [], error: error.message };
  }

  const comments: CommentWithAuthor[] = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      task_id: row.task_id,
      parent_id: row.parent_id,
      body: row.body,
      created_by: row.created_by,
      created_at: row.created_at,
      author: mapAuthor(
        profile
          ? {
              id: profile.id as string,
              email: profile.email as string,
              full_name: (profile.full_name as string | null) ?? null,
              deleted_at: (profile.deleted_at as string | null) ?? null,
              avatar_path: (profile.avatar_path as string | null) ?? null,
              updated_at: (profile.updated_at as string | undefined) ?? undefined,
            }
          : null,
      ),
    };
  });

  return { comments };
}

function commentErrorMessage(message: string) {
  if (message.includes("nested too deeply")) {
    return "This thread is too nested to reply again.";
  }
  if (message.includes("cannot reply to itself")) {
    return "A comment cannot reply to itself.";
  }
  if (message.includes("reply cycle")) {
    return "That reply would create a loop.";
  }
  return message;
}

async function listProjectMentionPeople(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<MentionPerson[]> {
  const { data } = await supabase
    .from("project_members")
    .select("user_id, profiles(id, email, full_name, deleted_at)")
    .eq("project_id", projectId);

  const people: MentionPerson[] = [];
  for (const row of data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile || profile.deleted_at) continue;
    people.push({
      id: (profile.id as string) ?? row.user_id,
      email: (profile.email as string) ?? "",
      full_name: (profile.full_name as string | null) ?? null,
      deleted_at: (profile.deleted_at as string | null) ?? null,
    });
  }
  return people;
}

export async function createTaskComment(
  projectId: string,
  listId: string,
  taskId: string,
  body: string,
  parentId?: string | null,
  mentionedUserIds: string[] = [],
) {
  const { supabase, user } = await requireUser();
  const trimmed = body.trim();
  const parent = parentId?.trim() || null;

  if (!trimmed) {
    return { error: "Comment cannot be empty." };
  }

  let parentAuthorId: string | null = null;

  if (parent) {
    const { data: parentComment } = await supabase
      .from("task_comments")
      .select("id, task_id, created_by")
      .eq("id", parent)
      .maybeSingle();

    if (!parentComment || parentComment.task_id !== taskId) {
      return { error: "Parent comment not found." };
    }
    parentAuthorId = parentComment.created_by;
  }

  const [{ data: task }, { data: list }, mentionPeople] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, created_by, assigned_to, reported_by")
      .eq("id", taskId)
      .maybeSingle(),
    supabase.from("lists").select("visibility").eq("id", listId).maybeSingle(),
    listProjectMentionPeople(supabase, projectId),
  ]);
  const clientVisible = list?.visibility === "public";
  const mentionedIds = resolveMentionedUserIds(
    trimmed,
    mentionPeople,
    mentionedUserIds,
  ).slice(0, 20);

  const { data: created, error } = await supabase
    .from("task_comments")
    .insert({
      task_id: taskId,
      parent_id: parent,
      body: trimmed,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: commentErrorMessage(error.message) };
  }

  if (created && mentionedIds.length > 0) {
    const { error: mentionError } = await supabase
      .from("task_comment_mentions")
      .insert(
        mentionedIds.map((userId) => ({
          comment_id: created.id,
          user_id: userId,
        })),
      );
    if (mentionError) {
      console.error("task_comment_mentions insert failed:", mentionError.message);
    }
  }

  const mentioned = new Set(mentionedIds);
  mentioned.delete(user.id);

  const recipients = new Set<string>();
  if (task?.created_by) recipients.add(task.created_by);
  if (task?.assigned_to) recipients.add(task.assigned_to);
  if (task?.reported_by) recipients.add(task.reported_by);
  if (parentAuthorId) recipients.add(parentAuthorId);
  for (const userId of mentioned) recipients.add(userId);
  recipients.delete(user.id);

  const deepLink = `/projects/${projectId}/lists/${listId}?task=${taskId}`;
  const isReply = !!parent;
  const taskTitle = task?.title ?? "task";

  for (const recipientId of recipients) {
    const wasMentioned = mentioned.has(recipientId);
    await notifyUser({
      userId: recipientId,
      type: wasMentioned
        ? "task_comment_mention"
        : isReply
          ? "task_comment_reply"
          : "task_comment",
      title: wasMentioned
        ? `You were mentioned on “${taskTitle}”`
        : isReply
          ? `Reply on “${taskTitle}”`
          : `New comment on “${taskTitle}”`,
      body: trimmed.slice(0, 180),
      link: deepLink,
    });
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "comment",
    entityId: taskId,
    action: isReply ? "replied" : "created",
    summary: isReply
      ? `Replied on “${taskTitle}”`
      : `Commented on “${taskTitle}”`,
    metadata: {
      list_visibility: list?.visibility ?? null,
      parent_id: parent,
      mentioned_user_ids: mentionedIds,
    },
    clientVisible,
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function deleteTaskComment(
  projectId: string,
  listId: string,
  commentId: string,
) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("task_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  return { success: true };
}
