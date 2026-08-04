"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyUser } from "@/lib/notify";
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
  const { supabase, user } = await requireUser();

  let query = supabase
    .from("conversations")
    .select(
      "id, project_id, client_user_id, updated_at, projects(name), profiles!conversations_client_user_id_fkey(email, full_name)",
    )
    .order("updated_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: rows, error } = await query;

  if (error) {
    return { error: error.message, conversations: [] as ConversationListItem[] };
  }

  const ids = (rows ?? []).map((row) => row.id as string);
  const lastByConversation = new Map<
    string,
    { body: string; created_at: string }
  >();

  if (ids.length > 0) {
    const { data: recent } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });

    for (const msg of recent ?? []) {
      const conversationId = msg.conversation_id as string;
      if (!lastByConversation.has(conversationId)) {
        lastByConversation.set(conversationId, {
          body: msg.body as string,
          created_at: msg.created_at as string,
        });
      }
    }
  }

  const conversations: ConversationListItem[] = (rows ?? []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const client = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const last = lastByConversation.get(row.id as string);

    return {
      id: row.id as string,
      project_id: row.project_id as string,
      project_name: (project?.name as string) ?? "Project",
      client_user_id: row.client_user_id as string,
      client_name:
        (client?.full_name as string | null) ||
        (client?.email as string) ||
        "Client",
      client_email: (client?.email as string) ?? "",
      updated_at: row.updated_at as string,
      last_message: last?.body ?? null,
      last_message_at: last?.created_at ?? null,
    };
  });

  return { conversations };
}

export async function listMessages(conversationId: string) {
  const { supabase } = await requireUser();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select(
      "id, project_id, client_user_id, projects(name), profiles!conversations_client_user_id_fkey(id, email, full_name)",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    return { error: convError?.message ?? "Conversation not found." };
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, body, created_at, profiles!messages_sender_id_fkey(id, email, full_name)",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message };
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
      client_name:
        (client?.full_name as string | null) ||
        (client?.email as string) ||
        "Client",
      client_email: (client?.email as string) ?? "",
    },
    messages: (messages ?? []).map((row) => {
      const sender = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      return {
        id: row.id as string,
        conversation_id: row.conversation_id as string,
        sender_id: row.sender_id as string,
        body: row.body as string,
        created_at: row.created_at as string,
        sender_name:
          (sender?.full_name as string | null) ||
          (sender?.email as string) ||
          "Someone",
      };
    }),
  };
}

export async function sendMessage(conversationId: string, body: string) {
  const { supabase, user } = await requireUser();
  const text = body.trim();

  if (!text) {
    return { error: "Message cannot be empty." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, project_id, client_user_id, projects(name)")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { error: "Conversation not found." };
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: text,
    })
    .select("id")
    .single();

  if (error || !message) {
    return { error: error?.message ?? "Could not send message." };
  }

  const project = Array.isArray(conversation.projects)
    ? conversation.projects[0]
    : conversation.projects;
  const projectName = (project?.name as string) ?? "Project";
  const link = `/messages/${conversationId}`;
  const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;

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

    const recipients = new Set<string>();
    for (const member of internals ?? []) {
      recipients.add(member.user_id);
    }
    for (const admin of platformAdmins ?? []) {
      recipients.add(admin.id);
    }
    recipients.delete(user.id);

    for (const recipientId of recipients) {
      await notifyUser({
        userId: recipientId,
        type: "chat_message",
        title: `Message on ${projectName}`,
        body: preview,
        link,
      });
    }
  } else {
    await notifyUser({
      userId: conversation.client_user_id,
      type: "chat_message",
      title: `Message from ${projectName}`,
      body: preview,
      link,
    });
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath(`/projects/${conversation.project_id}`);
  return { success: true, messageId: message.id as string };
}

export async function listProjectClients(projectId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, profiles(id, email, full_name)")
    .eq("project_id", projectId)
    .eq("role", "client")
    .order("user_id");

  if (error) {
    return { error: error.message, clients: [] as { id: string; name: string; email: string }[] };
  }

  const clients =
    data?.map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.user_id as string,
        email: (profile?.email as string) ?? "",
        name:
          (profile?.full_name as string | null) ||
          (profile?.email as string) ||
          "Client",
      };
    }) ?? [];

  return { clients };
}
