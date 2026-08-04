import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { MessagesInbox } from "@/components/messages-inbox";
import {
  ensureClientConversation,
  listConversations,
} from "@/lib/actions/chat";
import { openClientProjectChat } from "@/lib/actions/chat-nav";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("project_id, role, projects(id, name)")
      .eq("user_id", user.id),
  ]);

  const isPlatformAdmin = !!profile?.is_platform_admin;
  const clientProjects =
    memberships?.filter((m) => m.role === "client") ?? [];
  const isOnlyClient =
    !isPlatformAdmin &&
    (memberships?.length ?? 0) > 0 &&
    memberships?.every((m) => m.role === "client");

  if (isOnlyClient && clientProjects.length === 1) {
    const projectId = clientProjects[0].project_id as string;
    const ensured = await ensureClientConversation(projectId);
    if ("conversationId" in ensured && ensured.conversationId) {
      redirect(`/messages/${ensured.conversationId}`);
    }
  }

  const { conversations, error } = await listConversations();

  if (isOnlyClient && conversations.length === 0 && clientProjects.length > 0) {
    return (
      <div className="app-shell min-h-full">
        <AppHeader isPlatformAdmin={isPlatformAdmin} />
        <main className="app-container py-6 sm:py-10">
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
            Messages
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Message the Parallel team on a project.
          </p>
          <ul className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {clientProjects.map((membership) => {
              const project = Array.isArray(membership.projects)
                ? membership.projects[0]
                : membership.projects;
              const projectId = membership.project_id as string;
              return (
                <li key={projectId}>
                  <form action={openClientProjectChat.bind(null, projectId)}>
                    <button
                      type="submit"
                      className="flex w-full items-center justify-between gap-3 px-1 py-4 text-left hover:bg-[var(--surface)]/60"
                    >
                      <span className="font-medium">
                        {(project?.name as string) ?? "Project"}
                      </span>
                      <span className="text-sm text-[var(--accent)]">
                        Open chat
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-full">
      <AppHeader isPlatformAdmin={isPlatformAdmin} />
      <main className="app-container py-6 sm:py-10">
        <Link
          href="/projects"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Projects
        </Link>
        <div className="mt-3">
          {error ? (
            <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          <MessagesInbox
            conversations={conversations}
            emptyCopy={
              isOnlyClient
                ? "Pick a project to message the team."
                : "Open a project to message a client, or wait for a client to write in."
            }
          />
        </div>
      </main>
    </div>
  );
}
