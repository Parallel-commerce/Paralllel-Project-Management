import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MessagesInbox } from "@/components/messages-inbox";
import {
  ensureClientConversation,
  listConversations,
  listProjectClients,
} from "@/lib/actions/chat";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: project }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
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

  if (!project) {
    notFound();
  }

  const isPlatformAdmin = !!profile?.is_platform_admin;
  const role = membership?.role ?? null;
  const isInternal =
    isPlatformAdmin || role === "admin" || role === "member";

  if (role === "client") {
    const ensured = await ensureClientConversation(projectId);
    if ("conversationId" in ensured && ensured.conversationId) {
      redirect(`/messages/${ensured.conversationId}`);
    }
    redirect("/messages");
  }

  if (!isInternal) {
    redirect(`/projects/${projectId}`);
  }

  const [{ conversations, error }, { clients }] = await Promise.all([
    listConversations(projectId),
    listProjectClients(projectId),
  ]);

  return (
    <main className="app-container py-6 sm:py-10">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← {project.name}
        </Link>
        <div className="mt-3">
          {error ? (
            <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          <MessagesInbox
            title={`Messages · ${project.name}`}
            conversations={conversations}
            projectId={projectId}
            startableClients={clients}
            canDelete
            emptyCopy="Start a conversation with a client below, or wait for them to message you."
          />
        </div>
      </main>
  );
}
