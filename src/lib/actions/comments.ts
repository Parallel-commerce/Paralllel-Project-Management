"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  resolveMentionedUserIds,
  type MentionPerson,
} from "@/lib/mentions";
import { logActivity, notifyUser } from "@/lib/notify";
import { personDisplayName } from "@/lib/person";
import { profileAvatarPublicUrl } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/server";
import {
  COMMENT_IMAGE_MAX_BYTES,
  COMMENT_IMAGE_MAX_FILES,
  commentMediaPreview,
  isAllowedCommentImage,
  safeAttachmentFileName,
  TASK_ATTACHMENT_BUCKET,
} from "@/lib/task-attachments";
import type { TaskCommentAttachment } from "@/types/database";

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
  attachments: TaskCommentAttachment[];
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
      attachments: [],
    };
  });

  const commentIds = comments.map((comment) => comment.id);
  if (commentIds.length > 0) {
    const { data: attachmentRows } = await supabase
      .from("task_comment_attachments")
      .select(
        "id, comment_id, file_path, file_name, content_type, size_bytes, uploaded_by, created_at",
      )
      .in("comment_id", commentIds)
      .order("created_at", { ascending: true });

    const byComment = new Map<string, TaskCommentAttachment[]>();
    for (const row of (attachmentRows ?? []) as TaskCommentAttachment[]) {
      const list = byComment.get(row.comment_id) ?? [];
      list.push(row);
      byComment.set(row.comment_id, list);
    }
    for (const comment of comments) {
      comment.attachments = byComment.get(comment.id) ?? [];
    }
  }

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

function validateCommentImages(files: File[]) {
  if (files.length > COMMENT_IMAGE_MAX_FILES) {
    return {
      error: `You can attach up to ${COMMENT_IMAGE_MAX_FILES} images.`,
    };
  }

  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose an image to attach." };
    }
    if (!isAllowedCommentImage(file)) {
      return { error: `"${file.name}" is not a supported image type.` };
    }
    if (file.size > COMMENT_IMAGE_MAX_BYTES) {
      return { error: `"${file.name}" must be 10MB or smaller.` };
    }
  }

  return { files };
}

export async function createTaskComment(
  projectId: string,
  listId: string,
  taskId: string,
  body: string,
  parentId?: string | null,
  mentionedUserIds: string[] = [],
  files: File[] = [],
) {
  const { supabase, user } = await requireUser();
  const trimmed = body.trim();
  const parent = parentId?.trim() || null;
  const validated = validateCommentImages(files);

  if ("error" in validated) {
    return { error: validated.error };
  }

  if (!trimmed && validated.files.length === 0) {
    return { error: "Write a comment or attach an image." };
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

  if (error || !created) {
    return { error: commentErrorMessage(error?.message ?? "Could not post comment.") };
  }

  const uploadedPaths: string[] = [];
  for (const [index, file] of validated.files.entries()) {
    const safeName = safeAttachmentFileName(file.name) || `image-${index + 1}`;
    const path = `${projectId}/${taskId}/comments/${created.id}/${Date.now()}-${index}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(TASK_ATTACHMENT_BUCKET)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove(uploadedPaths);
      }
      await supabase.from("task_comments").delete().eq("id", created.id);
      return { error: uploadError.message };
    }

    uploadedPaths.push(path);

    const { error: attachmentError } = await supabase
      .from("task_comment_attachments")
      .insert({
        comment_id: created.id,
        file_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
      });

    if (attachmentError) {
      await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove(uploadedPaths);
      await supabase.from("task_comments").delete().eq("id", created.id);
      return { error: attachmentError.message };
    }
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

  if (parent) {
    await supabase.from("task_comment_reads").upsert(
      {
        user_id: user.id,
        comment_id: parent,
      },
      { onConflict: "user_id,comment_id", ignoreDuplicates: true },
    );
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
  const preview = commentMediaPreview(trimmed, validated.files.length);

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const fromName = personDisplayName(
    {
      full_name: authorProfile?.full_name ?? null,
      email: authorProfile?.email ?? null,
    },
    "Someone",
  );

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
      body: preview.slice(0, 280),
      emailBody: (trimmed || preview).slice(0, 2000),
      fromName,
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
  revalidatePath("/home");
  return { success: true };
}

export async function deleteTaskComment(
  projectId: string,
  listId: string,
  commentId: string,
) {
  const { supabase } = await requireUser();

  const { data: target } = await supabase
    .from("task_comments")
    .select("id, task_id")
    .eq("id", commentId)
    .maybeSingle();

  const commentIds = [commentId];
  if (target?.task_id) {
    const { data: thread } = await supabase
      .from("task_comments")
      .select("id, parent_id")
      .eq("task_id", target.task_id);
    const children = new Map<string, string[]>();
    for (const row of thread ?? []) {
      if (!row.parent_id) continue;
      const list = children.get(row.parent_id) ?? [];
      list.push(row.id);
      children.set(row.parent_id, list);
    }
    for (let i = 0; i < commentIds.length; i++) {
      commentIds.push(...(children.get(commentIds[i]) ?? []));
    }
  }

  const { data: attachments } = await supabase
    .from("task_comment_attachments")
    .select("file_path")
    .in("comment_id", commentIds);

  const { error } = await supabase
    .from("task_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    return { error: error.message };
  }

  const paths = (attachments ?? [])
    .map((row) => row.file_path)
    .filter((path): path is string => !!path);
  if (paths.length > 0) {
    await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove(paths);
  }

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  return { success: true };
}

export async function markTaskCommentsRead(commentIds: string[]) {
  const { supabase, user } = await requireUser();
  const ids = [...new Set(commentIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { success: true };
  }

  const { error } = await supabase.from("task_comment_reads").upsert(
    ids.map((commentId) => ({
      user_id: user.id,
      comment_id: commentId,
    })),
    { onConflict: "user_id,comment_id", ignoreDuplicates: true },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/home");
  return { success: true };
}

export async function markTaskCommentRead(commentId: string) {
  return markTaskCommentsRead([commentId]);
}
