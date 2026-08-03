import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ActivityFeed } from "@/components/activity-feed";
import { CreateListForm } from "@/components/create-list-form";
import { MembersPanel } from "@/components/members-panel";
import { ProjectSettings } from "@/components/project-settings";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_STATUSES,
  type ProjectRole,
  type TaskStatus,
} from "@/types/database";

type ListTaskStats = {
  total: number;
  byStatus: Record<TaskStatus, number>;
};

function emptyStats(): ListTaskStats {
  return {
    total: 0,
    byStatus: {
      todo: 0,
      in_progress: 0,
      requiring_feedback: 0,
      done: 0,
    },
  };
}

function ListMark({ visibility }: { visibility: string }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border ${
        visibility === "private"
          ? "border-[var(--border)] bg-[var(--surface-2)]"
          : "border-[var(--accent)]/20 bg-[var(--accent-soft)]"
      }`}
      aria-hidden
    >
      <span
        className={`h-0.5 w-5 rounded-full ${
          visibility === "private"
            ? "bg-[var(--muted)]"
            : "bg-[var(--accent)]"
        }`}
      />
      <span
        className={`h-0.5 w-5 rounded-full ${
          visibility === "private"
            ? "bg-[var(--muted)]/70"
            : "bg-[var(--accent)]/70"
        }`}
      />
      <span
        className={`h-0.5 w-3.5 rounded-full ${
          visibility === "private"
            ? "bg-[var(--muted)]/50"
            : "bg-[var(--accent)]/45"
        }`}
      />
    </span>
  );
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, logo_path")
    .eq("id", id)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const logoUrl = projectLogoPublicUrl(project.logo_path);

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const role = (membership?.role ?? "client") as ProjectRole;
  const isPlatformAdmin = !!profile?.is_platform_admin;
  const isAdmin = role === "admin" || isPlatformAdmin;
  const canCreateLists = role === "admin" || role === "member";

  const { data: lists } = await supabase
    .from("lists")
    .select("id, name, visibility, created_by, created_at, tasks(status, archived_at)")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role, profiles(email, full_name)")
    .eq("project_id", id);

  const { data: invites } = isAdmin
    ? await supabase
        .from("project_invites")
        .select("id, email, role")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const memberRows =
    members?.map((m) => {
      const profileRow = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        user_id: m.user_id,
        role: m.role as ProjectRole,
        profile: profileRow
          ? {
              email: profileRow.email as string,
              full_name: (profileRow.full_name as string | null) ?? null,
            }
          : null,
      };
    }) ?? [];

  const listRows =
    (lists ?? []).map((list) => {
      const stats = emptyStats();
      const tasks = Array.isArray(list.tasks) ? list.tasks : [];
      for (const task of tasks) {
        if (task.archived_at) continue;
        const status = task.status as TaskStatus;
        if (status in stats.byStatus) {
          stats.byStatus[status] += 1;
          stats.total += 1;
        }
      }
      return {
        id: list.id as string,
        name: list.name as string,
        visibility: list.visibility as string,
        stats,
      };
    }) ?? [];

  return (
    <div className="app-shell min-h-full">
      <AppHeader />
      <main className="app-container py-6 sm:py-10">
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href="/projects"
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ← Projects
              </Link>
              <div className="mt-3 flex items-start gap-3 sm:gap-4">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="h-12 w-12 shrink-0 rounded-xl border border-[var(--border)] bg-white object-cover sm:h-14 sm:w-14"
                  />
                ) : null}
                <div className="min-w-0">
                  <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
                    {project.name}
                  </h1>
                  {project.description ? (
                    <p className="mt-2 text-sm text-[var(--muted)] sm:text-base line-clamp-3 sm:line-clamp-none">
                      {project.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                    Your role: {role}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/projects/${id}/reports`}
                className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                Reports
              </Link>
              <ProjectSettings
                projectId={id}
                name={project.name}
                description={project.description}
                logoUrl={logoUrl}
                canManage={isAdmin}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-medium">Lists</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Public lists are visible to everyone on this project. Private
                  lists are only visible to their creator and admins.
                </p>
              </div>
            </div>

            <CreateListForm projectId={id} canCreate={canCreateLists} />

            {listRows.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--column)]/60 px-6 py-12 text-center">
                <p className="font-medium">No lists yet</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {canCreateLists
                    ? "Create a public list to share with the project, then add your first task."
                    : "Ask a team member to create a list for this project."}
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-2">
                {listRows.map((list) => (
                  <li key={list.id}>
                    <Link
                      href={`/projects/${id}/lists/${list.id}`}
                      className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--column)]/70 px-3 py-3 transition hover:border-[var(--foreground)]/15 hover:bg-[var(--surface)] active:bg-[var(--surface)] sm:gap-4 sm:px-4 sm:py-3.5"
                    >
                      <ListMark visibility={list.visibility} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium tracking-tight">
                            {list.name}
                          </p>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                              list.visibility === "private"
                                ? "bg-[var(--surface-2)] text-[var(--muted)]"
                                : "bg-[var(--accent-soft)] text-[var(--accent)]"
                            }`}
                          >
                            {list.visibility}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                          {list.stats.total === 0 ? (
                            <span>No tasks yet</span>
                          ) : (
                            <>
                              <span className="font-medium text-[var(--foreground)]">
                                {list.stats.total} task
                                {list.stats.total === 1 ? "" : "s"}
                              </span>
                              {TASK_STATUSES.map((status) => {
                                const count = list.stats.byStatus[status.value];
                                if (count === 0) return null;
                                return (
                                  <span key={status.value}>
                                    {count} {status.label.toLowerCase()}
                                  </span>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </div>
                      <span className="hidden shrink-0 text-sm text-[var(--accent)] sm:inline">
                        Open
                      </span>
                      <span
                        aria-hidden
                        className="shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)] sm:hidden"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="flex flex-col gap-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <MembersPanel
                projectId={id}
                isAdmin={isAdmin}
                currentUserId={user.id}
                members={memberRows}
                invites={
                  (invites ?? []) as {
                    id: string;
                    email: string;
                    role: ProjectRole;
                  }[]
                }
              />
            </div>
            <ActivityFeed projectId={id} role={role} />
          </aside>
        </div>
      </main>
    </div>
  );
}
