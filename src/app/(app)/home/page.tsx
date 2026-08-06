import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";

import {
  HomeQuickTaskForm,
  type HomeListOption,
} from "@/components/home-quick-task-form";
import { getCurrentProfile, requireSessionUser } from "@/lib/auth";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

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

function formatDue(value: string | null) {
  if (!value) return "No due date";
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM yyyy");
  } catch {
    return value;
  }
}

function statusLabel(status: TaskStatus) {
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
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
      .limit(8),
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
      .limit(8),
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

  // Prefer a stable list order for the create picker: by project then list name
  const listOptions = [...lists].sort((a, b) => {
    const byProject = a.projectName.localeCompare(b.projectName);
    if (byProject !== 0) return byProject;
    return a.name.localeCompare(b.name);
  });

  const listShortcuts = listOptions.slice(0, 12);
  const name = firstName(profile?.full_name, profile?.email || user.email || "");

  return (
    <main className="app-container py-6 sm:py-10">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Home
        </p>
        <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
          {greetingForNow()}, {name}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your projects, lists, and upcoming work — plus a quick way to capture
          a new task.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8 min-w-0">
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-medium">Upcoming tasks</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
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
            <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {(upcomingRows ?? []).length === 0 ? (
                <li className="px-1 py-8 text-sm text-[var(--muted)]">
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
                  const due = task.due_date as string | null;
                  const overdue = !!due && due < today;
                  return (
                    <li key={task.id as string}>
                      <Link
                        href={`/projects/${task.project_id}/lists/${task.list_id}?task=${task.id}`}
                        className="flex flex-col gap-1 px-1 py-3.5 hover:bg-[var(--surface)]/60 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      >
                        <div className="min-w-0">
                          {task.key ? (
                            <p className="text-xs font-medium tabular-nums tracking-wide text-[var(--muted)]">
                              {task.key as string}
                            </p>
                          ) : null}
                          <p className="truncate font-medium">
                            {task.title as string}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                            {(project?.name as string) ?? "Project"} ·{" "}
                            {(list?.name as string) ?? "List"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                          <span>
                            {statusLabel(task.status as TaskStatus)}
                          </span>
                          <span className={overdue ? "text-[var(--danger)]" : ""}>
                            {formatDue(due)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-medium">Your projects</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
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
            <ul className="mt-4 space-y-2">
              {(projects ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--muted)]">
                  No projects yet.{" "}
                  <Link href="/projects" className="text-[var(--accent)] hover:underline">
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
                        className="group flex min-h-[3.75rem] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 transition hover:border-[var(--foreground)]/15 hover:bg-white"
                      >
                        {logoUrl ? (
                          <Image
                            src={logoUrl}
                            alt=""
                            width={40}
                            height={40}
                            className="h-10 w-10 shrink-0 rounded-lg border border-[var(--border)] bg-white object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-sm text-[var(--accent)]">
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

          <section>
            <div>
              <h2 className="font-medium">Lists</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Shortcuts into boards across your projects.
              </p>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {listShortcuts.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--muted)] sm:col-span-2">
                  No lists to show yet.
                </li>
              ) : (
                listShortcuts.map((list) => (
                  <li key={list.id}>
                    <Link
                      href={`/projects/${list.projectId}/lists/${list.id}`}
                      className="flex min-h-[3.5rem] flex-col justify-center rounded-xl border border-[var(--border)] bg-[var(--column)]/70 px-3 py-3 transition hover:border-[var(--foreground)]/15 hover:bg-[var(--surface)]"
                    >
                      <p className="truncate font-medium tracking-tight">
                        {list.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {list.projectName}
                      </p>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <aside className="relative z-10 lg:sticky lg:top-20 lg:self-start">
          <section className="overflow-visible rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-medium">New task</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Capture work and put it on a list. You&apos;ll be set as assignee.
            </p>
            <div className="mt-4">
              <HomeQuickTaskForm
                lists={listOptions}
                currentUserId={user.id}
              />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
