import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { CreateProjectForm } from "@/components/create-project-form";
import { ParallelLogo } from "@/components/parallel-logo";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_STATUSES,
  type TaskStatus,
} from "@/types/database";

type ProjectTaskStats = {
  total: number;
  byStatus: Record<TaskStatus, number>;
};

function emptyStats(): ProjectTaskStats {
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

export default async function ProjectsPage() {
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

  const { count: internalCount } = await supabase
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("role", ["admin", "member"]);

  const canCreateProjects =
    !!profile?.is_platform_admin || (internalCount ?? 0) > 0;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, logo_path, created_at")
    .order("created_at", { ascending: false });

  const projectIds = (projects ?? []).map((project) => project.id);
  const statsByProject: Record<string, ProjectTaskStats> = {};

  if (projectIds.length > 0) {
    const { data: listRows } = await supabase
      .from("lists")
      .select("project_id, tasks(status, archived_at)")
      .in("project_id", projectIds);

    for (const list of listRows ?? []) {
      const projectId = list.project_id as string;
      const stats = statsByProject[projectId] ?? emptyStats();
      const tasks = Array.isArray(list.tasks) ? list.tasks : [];
      for (const task of tasks) {
        if ((task as { archived_at?: string | null }).archived_at) continue;
        const status = task.status as TaskStatus;
        if (status in stats.byStatus) {
          stats.byStatus[status] += 1;
          stats.total += 1;
        }
      }
      statsByProject[projectId] = stats;
    }
  }

  const isEmpty = (projects ?? []).length === 0;

  return (
    <div className="app-shell min-h-full">
      <AppHeader />
      <main className="app-container py-6 sm:py-10">
        {isEmpty ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
            <ParallelLogo href="/projects" className="h-8 w-auto" />
            {canCreateProjects ? (
              <>
                <h1 className="mt-4 font-display text-2xl tracking-tight">
                  Create your first project
                </h1>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Then invite your team or clients, add a list, and create the
                  first task. That&apos;s the whole loop.
                </p>
                <ol className="mt-6 space-y-2 text-sm text-[var(--muted)]">
                  <li>1. Name the project</li>
                  <li>2. Invite people from the project page</li>
                  <li>3. Create a public list and your first task</li>
                </ol>
                <div className="mt-6">
                  <CreateProjectForm />
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-4 font-display text-2xl tracking-tight">
                  No projects yet
                </h1>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  You&apos;ll see projects here once Parallel invites you as a
                  team member or client.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <section className="flex-1 min-w-0">
              <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
                Projects
              </h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Open a project to manage lists, tasks, and people.
              </p>

              <ul className="mt-8 space-y-2">
                {(projects ?? []).map((project) => {
                  const logoUrl = projectLogoPublicUrl(project.logo_path);
                  const stats = statsByProject[project.id] ?? emptyStats();
                  return (
                    <li key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 transition active:bg-white sm:gap-4 sm:px-4 sm:py-3.5 hover:border-[var(--foreground)]/15 hover:bg-white"
                      >
                        {logoUrl ? (
                          <Image
                            src={logoUrl}
                            alt=""
                            width={44}
                            height={44}
                            className="h-11 w-11 shrink-0 rounded-lg border border-[var(--border)] bg-white object-cover"
                          />
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-base text-[var(--accent)]">
                            {project.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium tracking-tight">
                            {project.name}
                          </p>
                          {project.description ? (
                            <p className="mt-0.5 line-clamp-1 text-sm text-[var(--muted)]">
                              {project.description}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-sm text-[var(--muted)]">
                              No description
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                            {stats.total === 0 ? (
                              <span>No tasks yet</span>
                            ) : (
                              <>
                                <span className="font-medium text-[var(--foreground)]">
                                  {stats.total} task
                                  {stats.total === 1 ? "" : "s"}
                                </span>
                                {TASK_STATUSES.map((status) => {
                                  const count = stats.byStatus[status.value];
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
                  );
                })}
              </ul>
            </section>

            {canCreateProjects ? (
              <aside className="w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 lg:w-80">
                <h2 className="font-medium">New project</h2>
                <CreateProjectForm />
              </aside>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
