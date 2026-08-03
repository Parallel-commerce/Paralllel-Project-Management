"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { profileAvatarPublicUrl } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/server";
import { logActivity, notifyUser } from "@/lib/notify";

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
        avatar_path: string | null;
        updated_at?: string;
      }
    | null
    | undefined,
): CommentAuthor | null {
  if (!profile) return null;
  const baseUrl = profileAvatarPublicUrl(profile.avatar_path);
  const avatarUrl = baseUrl
    ? `${baseUrl}?v=${encodeURIComponent(profile.updated_at ?? "")}`
    : null;
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
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
      "id, task_id, parent_id, body, created_by, created_at, profiles(id, email, full_name, avatar_path, updated_at)",
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
              avatar_path: (profile.avatar_path as string | null) ?? null,
              updated_at: (profile.updated_at as string | undefined) ?? undefined,
            }
          : null,
      ),
    };
  });

  return { comments };
}

export async function createTaskComment(
  projectId: string,
  listId: string,
  taskId: string,
  body: string,
  parentId?: string | null,
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
      .select("id, task_id, parent_id, created_by")
      .eq("id", parent)
      .maybeSingle();

    if (!parentComment || parentComment.task_id !== taskId) {
      return { error: "Parent comment not found." };
    }
    if (parentComment.parent_id) {
      return { error: "You can only reply to top-level comments." };
    }
    parentAuthorId = parentComment.created_by;
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("title, created_by, assigned_to, reported_by")
    .eq("id", taskId)
    .maybeSingle();

  const { data: list } = await supabase
    .from("lists")
    .select("visibility")
    .eq("id", listId)
    .maybeSingle();
  const clientVisible = list?.visibility === "public";

  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    parent_id: parent,
    body: trimmed,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  const recipients = new Set<string>();
  if (task?.created_by) recipients.add(task.created_by);
  if (task?.assigned_to) recipients.add(task.assigned_to);
  if (task?.reported_by) recipients.add(task.reported_by);
  if (parentAuthorId) recipients.add(parentAuthorId);
  recipients.delete(user.id);

  const deepLink = `/projects/${projectId}/lists/${listId}?task=${taskId}`;
  const isReply = !!parent;

  for (const recipientId of recipients) {
    await notifyUser({
      userId: recipientId,
      type: isReply ? "task_comment_reply" : "task_comment",
      title: isReply
        ? `Reply on “${task?.title ?? "task"}”`
        : `New comment on “${task?.title ?? "task"}”`,
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
      ? `Replied on “${task?.title ?? "task"}”`
      : `Commented on “${task?.title ?? "task"}”`,
    metadata: {
      list_visibility: list?.visibility ?? null,
      parent_id: parent,
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
