import { CreateProjectForm } from "@/components/create-project-form";
import { ParallelLogo } from "@/components/parallel-logo";
import { ProjectsGrid } from "@/components/projects-grid";
import { requireSessionUser } from "@/lib/auth";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import type { TaskStatus } from "@/types/database";

export default async function ProjectsPage() {
  const { supabase, user } = await requireSessionUser();

  const [{ data: profile }, { count: internalCount }, { data: projects }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("project_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("role", ["admin", "member"]),
      supabase
        .from("projects")
        .select("id, name, logo_path, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);

  const canCreateProjects =
    !!profile?.is_platform_admin || (internalCount ?? 0) > 0;
  const canReorder = canCreateProjects;

  const projectIds = (projects ?? []).map((project) => project.id);
  const todoByProject: Record<string, number> = {};

  if (projectIds.length > 0) {
    const { data: statRows } = await supabase.rpc("project_task_stats", {
      p_project_ids: projectIds,
    });

    for (const row of statRows ?? []) {
      if ((row.status as TaskStatus) !== "todo") continue;
      todoByProject[row.project_id as string] = Number(row.task_count ?? 0);
    }
  }

  const isEmpty = (projects ?? []).length === 0;

  return (
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
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          <section className="min-w-0 flex-1">
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
              Projects
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {canReorder
                ? "Open a project to manage lists, tasks, and people. Drag the handle to reorder."
                : "Open a project to manage lists, tasks, and people."}
            </p>

            <ProjectsGrid
              canReorder={canReorder}
              projects={(projects ?? []).map((project) => ({
                id: project.id,
                name: project.name,
                logoUrl: projectLogoPublicUrl(project.logo_path),
                todoCount: todoByProject[project.id] ?? 0,
              }))}
            />
          </section>

          {canCreateProjects ? (
            <aside className="w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 xl:w-80">
              <h2 className="font-medium">New project</h2>
              <CreateProjectForm />
            </aside>
          ) : null}
        </div>
      )}
    </main>
  );
}
