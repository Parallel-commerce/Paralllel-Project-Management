import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/components/chat-thread";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  const result = await listMessages(conversationId);

  if (result.error || !result.conversation || !result.messages) {
    notFound();
  }

  const { conversation, messages } = result;
  const isClient = conversation.client_user_id === user.id;

  return (
    <main className="app-container py-6 sm:py-10">
        <Link
          href={
            isClient
              ? "/messages"
              : `/projects/${conversation.project_id}/messages`
          }
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Messages
        </Link>
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
