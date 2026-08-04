"use server";

import { redirect } from "next/navigation";

import { ensureClientConversation } from "@/lib/actions/chat";

export async function openClientProjectChat(projectId: string) {
  const result = await ensureClientConversation(projectId);
  if ("conversationId" in result && result.conversationId) {
    redirect(`/messages/${result.conversationId}`);
  }
  redirect("/messages");
}
