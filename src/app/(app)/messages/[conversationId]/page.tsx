import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/components/chat-thread";
import { DeleteConversationButton } from "@/components/delete-conversation-button";
import { listMessages } from "@/lib/actions/chat";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, result] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
    listMessages(conversationId),
  ]);

  if (result.error || !result.conversation || !result.messages) {
    notFound();
  }

  const { conversation, messages } = result;
  const isClient = conversation.client_user_id === user.id;

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", conversation.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const canDelete =
    !!profile?.is_platform_admin ||
    membership?.role === "admin" ||
    membership?.role === "member";

  const backHref = isClient
    ? "/messages"
    : `/projects/${conversation.project_id}/messages`;

  return (
    <main className="app-container py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Messages
        </Link>
        {canDelete ? (
          <DeleteConversationButton
            conversationId={conversation.id}
            clientName={conversation.client_name}
            redirectTo={backHref}
          />
        ) : null}
      </div>
      <div className="mt-3">
        <ChatThread
          conversationId={conversation.id}
          currentUserId={user.id}
          initialMessages={messages}
          heading={
            isClient ? conversation.project_name : conversation.client_name
          }
          subheading={
            isClient
              ? "Chat with the project team"
              : `${conversation.project_name} · ${conversation.client_email}`
          }
        />
      </div>
    </main>
  );
}
