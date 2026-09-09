"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  resolveMentionedUserIds,
  type MentionPerson,
} from "@/lib/mentions";
import { notifyUser } from "@/lib/notify";
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
import type { MessageAttachment } from "@/types/database";

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

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  sender_name: string;
  sender_avatar_url: string | null;
  attachments: MessageAttachment[];
};

export type ConversationListItem = {
  id: string;
  project_id: string;
  project_name: string;
  client_user_id: string;
  client_name: string;
  client_email: string;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
};

export async function ensureClientConversation(
  projectId: string,
  clientUserId?: string,
) {
  const { supabase, user } = await requireUser();

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const isPlatformAdmin = !!profile?.is_platform_admin;
  const role = membership?.role ?? null;
  const isInternal =
    isPlatformAdmin || role === "admin" || role === "member";

  let targetClientId = clientUserId ?? null;

  if (!targetClientId) {
    if (role === "client") {
      targetClientId = user.id;
    } else {
      return { error: "Client is required." };
    }
  }

  if (role === "client" && targetClientId !== user.id) {
    return { error: "You can only open your own conversation." };
  }

  if (!isInternal && role !== "client") {
    return { error: "Not allowed." };
  }

  if (isInternal || isPlatformAdmin) {
    const { data: clientMembership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", targetClientId)
      .maybeSingle();

    if (clientMembership?.role !== "client") {
      return { error: "That user is not a client on this project." };
    }
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .eq("client_user_id", targetClientId)
    .maybeSingle();

  if (existing) {
    return { conversationId: existing.id as string };
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      project_id: projectId,
      client_user_id: targetClientId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: error?.message ?? "Could not create conversation." };
  }

  revalidatePath("/messages");
  revalidatePath(`/projects/${projectId}`);
  return { conversationId: created.id as string };
}

export async function listConversations(projectId?: string) {
  const { supabase } = await requireUser();

  let query = supabase
    .from("conversations")
    .select(
      "id, project_id, client_user_id, updated_at, last_message_body, last_message_at, projects(name), profiles!conversations_client_user_id_fkey(email, full_name, deleted_at)",
    )
    .order("updated_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: rows, error } = await query;

  if (error) {
    return { error: error.message, conversations: [] as ConversationListItem[] };
  }

  const conversations: ConversationListItem[] = (rows ?? []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const client = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      id: row.id as string,
      project_id: row.project_id as string,
      project_name: (project?.name as string) ?? "Project",
      client_user_id: row.client_user_id as string,
      client_name: personDisplayName(
        {
          full_name: (client?.full_name as string | null) ?? null,
          email: (client?.email as string | null) ?? null,
          deleted_at: (client?.deleted_at as string | null) ?? null,
        },
        "Client",
      ),
      client_email: (client?.email as string) ?? "",
      updated_at: row.updated_at as string,
      last_message: (row.last_message_body as string | null) ?? null,
      last_message_at: (row.last_message_at as string | null) ?? null,
    };
  });

  return { conversations };
}

function mapSenderAvatar(
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
) {
  if (!profile || profile.deleted_at) return null;
  const baseUrl = profileAvatarPublicUrl(profile.avatar_path);
  return baseUrl
    ? `${baseUrl}?v=${encodeURIComponent(profile.updated_at ?? "")}`
    : null;
}

function senderNameFromProfile(
  profile:
    | {
        full_name: string | null;
        email: string | null;
        deleted_at?: string | null;
      }
    | null
    | undefined,
) {
  return personDisplayName(
    {
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      deleted_at: profile?.deleted_at ?? null,
    },
    "Someone",
  );
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

function validateMessageImages(files: File[]) {
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

function messageErrorMessage(message: string) {
  if (message.includes("nested too deeply")) {
    return "This thread is too nested to reply again.";
  }
  if (message.includes("cannot reply to itself")) {
    return "A message cannot reply to itself.";
  }
  if (message.includes("reply cycle")) {
    return "That reply would create a loop.";
  }
  return message;
}

async function loadMessageAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageIds: string[],
) {
  const byMessage = new Map<string, MessageAttachment[]>();
  if (messageIds.length === 0) return byMessage;

  const { data: rows } = await supabase
    .from("message_attachments")
    .select(
      "id, message_id, conversation_id, file_path, file_name, content_type, size_bytes, uploaded_by, created_at",
    )
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });

  for (const row of (rows ?? []) as MessageAttachment[]) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push(row);
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

export async function listMessages(conversationId: string) {
  const { supabase } = await requireUser();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select(
      "id, project_id, client_user_id, projects(name), profiles!conversations_client_user_id_fkey(id, email, full_name, deleted_at)",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    return { error: convError?.message ?? "Conversation not found." };
  }

  const [{ data: messages, error }, members] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, parent_id, body, created_at, profiles!messages_sender_id_fkey(id, email, full_name, deleted_at, avatar_path, updated_at)",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    listProjectMentionPeople(supabase, conversation.project_id as string),
  ]);

  if (error) {
    return { error: error.message };
  }

  const mapped: ChatMessage[] = (messages ?? []).map((row) => {
    const sender = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const profile = sender
      ? {
          id: sender.id as string,
          email: sender.email as string,
          full_name: (sender.full_name as string | null) ?? null,
          deleted_at: (sender.deleted_at as string | null) ?? null,
          avatar_path: (sender.avatar_path as string | null) ?? null,
          updated_at: (sender.updated_at as string | undefined) ?? undefined,
        }
      : null;
    return {
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      sender_id: row.sender_id as string,
      parent_id: (row.parent_id as string | null) ?? null,
      body: row.body as string,
      created_at: row.created_at as string,
      sender_name: senderNameFromProfile(profile),
      sender_avatar_url: mapSenderAvatar(profile),
      attachments: [],
    };
  });

  const attachments = await loadMessageAttachments(
    supabase,
    mapped.map((message) => message.id),
  );
  for (const message of mapped) {
    message.attachments = attachments.get(message.id) ?? [];
  }

  const project = Array.isArray(conversation.projects)
    ? conversation.projects[0]
    : conversation.projects;
  const client = Array.isArray(conversation.profiles)
    ? conversation.profiles[0]
    : conversation.profiles;

  return {
    conversation: {
      id: conversation.id as string,
      project_id: conversation.project_id as string,
      project_name: (project?.name as string) ?? "Project",
      client_user_id: conversation.client_user_id as string,
      client_name: personDisplayName(
        {
          full_name: (client?.full_name as string | null) ?? null,
          email: (client?.email as string | null) ?? null,
          deleted_at: (client?.deleted_at as string | null) ?? null,
        },
        "Client",
      ),
      client_email: (client?.email as string) ?? "",
    },
    messages: mapped,
    members,
  };
}

export async function sendMessage(
  conversationId: string,
  body: string,
  parentId?: string | null,
  mentionedUserIds: string[] = [],
  files: File[] = [],
) {
  const { supabase, user } = await requireUser();
  const text = body.trim();
  const parent = parentId?.trim() || null;
  const validated = validateMessageImages(files);

  if ("error" in validated) {
    return { error: validated.error };
  }

  if (!text && validated.files.length === 0) {
    return { error: "Write a message or attach an image." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, project_id, client_user_id, projects(name)")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { error: "Conversation not found." };
  }

  let parentAuthorId: string | null = null;
  if (parent) {
    const { data: parentMessage } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id")
      .eq("id", parent)
      .maybeSingle();

    if (!parentMessage || parentMessage.conversation_id !== conversationId) {
      return { error: "Parent message not found." };
    }
    parentAuthorId = parentMessage.sender_id as string;
  }

  const mentionPeople = await listProjectMentionPeople(
    supabase,
    conversation.project_id as string,
  );
  const mentionedIds = resolveMentionedUserIds(
    text,
    mentionPeople,
    mentionedUserIds,
  ).slice(0, 20);

  const { data: created, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      parent_id: parent,
      body: text,
    })
    .select("id, created_at")
    .single();

  if (error || !created) {
    return {
      error: messageErrorMessage(error?.message ?? "Could not send message."),
    };
  }

  const uploadedPaths: string[] = [];
  const attachments: MessageAttachment[] = [];
  for (const [index, file] of validated.files.entries()) {
    const safeName = safeAttachmentFileName(file.name) || `image-${index + 1}`;
    const path = `${conversation.project_id}/chat/${conversationId}/${created.id}/${Date.now()}-${index}-${safeName}`;
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
      await supabase.from("messages").delete().eq("id", created.id);
      return { error: uploadError.message };
    }

    uploadedPaths.push(path);

    const { data: attachment, error: attachmentError } = await supabase
      .from("message_attachments")
      .insert({
        message_id: created.id,
        conversation_id: conversationId,
        file_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select(
        "id, message_id, conversation_id, file_path, file_name, content_type, size_bytes, uploaded_by, created_at",
      )
      .single();

    if (attachmentError || !attachment) {
      await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove(uploadedPaths);
      await supabase.from("messages").delete().eq("id", created.id);
      return { error: attachmentError?.message ?? "Could not attach image." };
    }

    attachments.push(attachment as MessageAttachment);
  }

  if (mentionedIds.length > 0) {
    const { error: mentionError } = await supabase
      .from("message_mentions")
      .insert(
        mentionedIds.map((userId) => ({
          message_id: created.id,
          user_id: userId,
        })),
      );
    if (mentionError) {
      console.error("message_mentions insert failed:", mentionError.message);
    }
  }

  const project = Array.isArray(conversation.projects)
    ? conversation.projects[0]
    : conversation.projects;
  const projectName = (project?.name as string) ?? "Project";
  const link = `/messages/${conversationId}`;
  const preview = commentMediaPreview(text, validated.files.length);
  const previewShort =
    preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;

  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("full_name, email, deleted_at, avatar_path, updated_at")
    .eq("id", user.id)
    .maybeSingle();
  const fromName = senderNameFromProfile(senderProfile);
  const senderAvatarUrl = mapSenderAvatar(
    senderProfile
      ? {
          id: user.id,
          email: senderProfile.email ?? "",
          full_name: senderProfile.full_name ?? null,
          deleted_at: senderProfile.deleted_at ?? null,
          avatar_path: senderProfile.avatar_path ?? null,
          updated_at: senderProfile.updated_at ?? undefined,
        }
      : null,
  );

  const mentioned = new Set(mentionedIds);
  mentioned.delete(user.id);

  const recipients = new Set<string>();
  const senderIsClient = conversation.client_user_id === user.id;

  if (senderIsClient) {
    const { data: internals } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", conversation.project_id)
      .in("role", ["admin", "member"]);

    const { data: platformAdmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_platform_admin", true);

    for (const member of internals ?? []) {
      recipients.add(member.user_id);
    }
    for (const admin of platformAdmins ?? []) {
      recipients.add(admin.id);
    }
  } else {
    recipients.add(conversation.client_user_id as string);
  }

  if (parentAuthorId) recipients.add(parentAuthorId);
  for (const userId of mentioned) recipients.add(userId);
  recipients.delete(user.id);

  const isReply = !!parent;

  for (const recipientId of recipients) {
    const wasMentioned = mentioned.has(recipientId);
    await notifyUser({
      userId: recipientId,
      type: wasMentioned
        ? "chat_message_mention"
        : isReply && recipientId === parentAuthorId
          ? "chat_message_reply"
          : "chat_message",
      title: wasMentioned
        ? `You were mentioned on ${projectName}`
        : isReply && recipientId === parentAuthorId
          ? `Reply on ${projectName}`
          : senderIsClient
            ? `Message on ${projectName}`
            : `Message from ${projectName}`,
      body: previewShort,
      emailBody: (text || preview).slice(0, 2000),
      fromName,
      link,
    });
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath(`/projects/${conversation.project_id}`);

  const chatMessage: ChatMessage = {
    id: created.id as string,
    conversation_id: conversationId,
    sender_id: user.id,
    parent_id: parent,
    body: text,
    created_at: created.created_at as string,
    sender_name: fromName,
    sender_avatar_url: senderAvatarUrl,
    attachments,
  };

  return { success: true, message: chatMessage };
}

export async function deleteMessage(messageId: string) {
  const { supabase } = await requireUser();

  const { data: target } = await supabase
    .from("messages")
    .select("id, conversation_id, conversations(project_id)")
    .eq("id", messageId)
    .maybeSingle();

  if (!target) {
    return { error: "Message not found." };
  }

  const { data: attachments } = await supabase
    .from("message_attachments")
    .select("file_path")
    .eq("message_id", messageId);

  const { error } = await supabase.from("messages").delete().eq("id", messageId);

  if (error) {
    return { error: error.message };
  }

  const paths = (attachments ?? [])
    .map((row) => row.file_path)
    .filter((path): path is string => !!path);
  if (paths.length > 0) {
    await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove(paths);
  }

  const conversation = Array.isArray(target.conversations)
    ? target.conversations[0]
    : target.conversations;
  const projectId = conversation?.project_id as string | undefined;

  revalidatePath("/messages");
  revalidatePath(`/messages/${target.conversation_id}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
  return { success: true as const };
}

export async function listProjectClients(projectId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, profiles(id, email, full_name, deleted_at)")
    .eq("project_id", projectId)
    .eq("role", "client")
    .order("user_id");

  if (error) {
    return { error: error.message, clients: [] as { id: string; name: string; email: string }[] };
  }

  const clients =
    data
      ?.map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (profile?.deleted_at) return null;
        return {
          id: row.user_id as string,
          email: (profile?.email as string) ?? "",
          name: personDisplayName(
            {
              full_name: (profile?.full_name as string | null) ?? null,
              email: (profile?.email as string | null) ?? null,
              deleted_at: null,
            },
            "Client",
          ),
        };
      })
      .filter((client): client is { id: string; name: string; email: string } => !!client) ?? [];

  return { clients };
}

export async function deleteConversation(conversationId: string) {
  const { supabase } = await requireUser();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, project_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { error: "Conversation not found." };
  }

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath(`/projects/${conversation.project_id}`);
  revalidatePath(`/projects/${conversation.project_id}/messages`);
  return { success: true as const };
}
