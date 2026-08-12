import Image from "next/image";
import Link from "next/link";

import { AdminHomeInsights } from "@/components/admin-home-insights";
import {
  HomeQuickTaskForm,
  type HomeListOption,
} from "@/components/home-quick-task-form";
import { TaskWorkLink } from "@/components/task-work-link";
import { getCurrentProfile, requireSessionUser } from "@/lib/auth";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import type { TaskStatus } from "@/types/database";

function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName: string | null | undefined, email: string) {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return email.split("@")[0] || "there";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function HomeDashboardPage() {
  const { supabase, user } = await requireSessionUser();
  const profile = await getCurrentProfile();
  const today = todayIso();

  const [
    { data: projects },
    { data: listRows },
    { data: upcomingRows },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, logo_path, created_at")
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("lists")
      .select("id, name, project_id, created_at, projects(id, name)")
      .order("name", { ascending: true }),
    supabase
      .from("tasks")
      .select(
        "id, key, title, due_date, status, list_id, project_id, projects(name), lists(name)",
      )
      .eq("assigned_to", user.id)
      .neq("status", "done")
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  const lists: HomeListOption[] = (listRows ?? [])
    .map((row) => {
      const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      const projectId =
        (row.project_id as string) ||
        (project?.id as string | undefined) ||
        "";
      if (!projectId) return null;
      return {
        id: row.id as string,
        name: row.name as string,
        projectId,
        projectName: (project?.name as string) ?? "Project",
      };
    })
    .filter((list): list is HomeListOption => !!list);

  const listOptions = [...lists].sort((a, b) => {
    const byProject = a.projectName.localeCompare(b.projectName);
    if (byProject !== 0) return byProject;
    return a.name.localeCompare(b.name);
  });

  const name = firstName(profile?.full_name, profile?.email || user.email || "");
  const isPlatformAdmin = !!profile?.is_platform_admin;

  return (
    <main className="app-container py-6 sm:py-10">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Home
        </p>
        <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
          {greetingForNow()}, {name}
        </h1>
        <p className="mt-2 hidden text-sm text-[var(--muted)] sm:block">
          Your projects and upcoming work — plus a quick way to capture a new
          task
          {isPlatformAdmin ? ", and an operations overview" : ""}.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        {isPlatformAdmin ? (
          <div className="order-4 min-w-0 lg:order-none lg:col-start-1 lg:row-start-1">
            <AdminHomeInsights />
          </div>
        ) : null}

        <section
          className={`order-1 min-w-0 lg:order-none lg:col-start-1 ${
            isPlatformAdmin ? "lg:row-start-2" : "lg:row-start-1"
          }`}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-medium">Upcoming tasks</h2>
              <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
                Assigned to you, ordered by due date.
              </p>
            </div>
            <Link
              href="/tasks"
              className="shrink-0 text-sm text-[var(--accent)] hover:underline"
            >
              My work
            </Link>
          </div>
          <ul className="mt-3 space-y-2 sm:mt-4">
            {(upcomingRows ?? []).length === 0 ? (
              <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)] sm:py-8">
                Nothing assigned right now. Create a task or check My work.
              </li>
            ) : (
              (upcomingRows ?? []).map((task) => {
                const project = Array.isArray(task.projects)
                  ? task.projects[0]
                  : task.projects;
                const list = Array.isArray(task.lists)
                  ? task.lists[0]
                  : task.lists;
                return (
                  <li key={task.id as string}>
                    <TaskWorkLink
                      href={`/projects/${task.project_id}/lists/${task.list_id}?task=${task.id}`}
                      title={task.title as string}
                      status={task.status as TaskStatus}
                      taskKey={(task.key as string | null) ?? null}
                      dueDate={(task.due_date as string | null) ?? null}
                      projectName={(project?.name as string) ?? "Project"}
                      listName={(list?.name as string) ?? "List"}
                      todayIso={today}
                    />
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <aside className="order-2 relative z-10 lg:order-none lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          <section className="overflow-visible rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <h2 className="font-medium">New task</h2>
            <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
              Capture work and put it on a list. You&apos;ll be set as assignee.
            </p>
            <div className="mt-3 sm:mt-4">
              <HomeQuickTaskForm
                lists={listOptions}
                currentUserId={user.id}
              />
            </div>
          </section>
        </aside>

        <section
          className={`order-3 min-w-0 lg:order-none lg:col-start-1 ${
            isPlatformAdmin ? "lg:row-start-3" : "lg:row-start-2"
          }`}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-medium">Your projects</h2>
              <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
                Jump back into recent projects.
              </p>
            </div>
            <Link
              href="/projects"
              className="shrink-0 text-sm text-[var(--accent)] hover:underline"
            >
              All projects
            </Link>
          </div>
          <ul className="mt-3 space-y-2 sm:mt-4">
            {(projects ?? []).length === 0 ? (
              <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)] sm:py-8">
                No projects yet.{" "}
                <Link
                  href="/projects"
                  className="text-[var(--accent)] hover:underline"
                >
                  Open projects
                </Link>{" "}
                to get started.
              </li>
            ) : (
              (projects ?? []).map((project) => {
                const logoUrl = projectLogoPublicUrl(project.logo_path);
                return (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="group flex min-h-[3.25rem] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition hover:border-[var(--foreground)]/15 hover:bg-white sm:min-h-[3.75rem] sm:py-3"
                    >
                      {logoUrl ? (
                        <Image
                          src={logoUrl}
                          alt=""
                          width={40}
                          height={40}
                          className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border)] bg-white object-cover sm:h-10 sm:w-10"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-sm text-[var(--accent)] sm:h-10 sm:w-10">
                          {project.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium tracking-tight">
                          {project.name}
                        </p>
                        {project.description ? (
                          <p className="mt-0.5 hidden line-clamp-1 text-sm text-[var(--muted)] sm:block">
                            {project.description}
                          </p>
                        ) : null}
                      </div>
                      <span
                        aria-hidden
                        className="shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
