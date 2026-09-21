import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminOnly } from "@/components/admin-only";
import { ProjectDeleteSettings, ProjectSettings } from "@/components/project-settings";
import { StoreSetupForm } from "@/components/store-setup-form";
import { requireSessionUser } from "@/lib/auth";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { projectEngagementFromRow } from "@/lib/project-type";
import { normalizeScheduledWeekdays } from "@/lib/scheduled-weekdays";
import { toPublicConnection } from "@/lib/shopify/connection";
import type {
  ProjectRole,
  ProjectShopifyConnection,
  ProjectThemeGit,
} from "@/types/database";

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireSessionUser();

  const [{ data: project }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, description, logo_path, scheduled_weekdays, project_engagement(project_type, monthly_hours)",
        )
        .eq("id", id)
        .maybeSingle(),
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

  if (!project) {
    notFound();
  }

  const role = (membership?.role ?? "client") as ProjectRole;
  const isAdmin = role === "admin" || !!profile?.is_platform_admin;
  if (!isAdmin) {
    notFound();
  }

  const [{ data: connectionRow }, { data: themeGitRow }] = await Promise.all([
    supabase
      .from("project_shopify_connections")
      .select("*")
      .eq("project_id", id)
      .maybeSingle(),
    supabase
      .from("project_theme_git")
      .select("*")
      .eq("project_id", id)
      .maybeSingle(),
  ]);

  const engagement = projectEngagementFromRow(project.project_engagement);
  const connection = connectionRow
    ? toPublicConnection(connectionRow as ProjectShopifyConnection)
    : null;
  const themeGit = (themeGitRow as ProjectThemeGit | null) ?? null;

  return (
    <main className="app-container py-6 sm:py-10">
      <Link
        href={`/projects/${id}`}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← {project.name}
      </Link>
      <h1 className="mt-3 font-display text-3xl tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Project details, Shopify connection, and the live theme git repo.
        Clients never see this page.
      </p>

      {query.connected === "1" ? (
        <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          Shopify store connected.
        </p>
      ) : null}
      {query.error ? (
        <p className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--danger)]">
          {query.error}
        </p>
      ) : null}

      <AdminOnly className="mt-8">
        <div className="space-y-8 p-5">
          <ProjectSettings
            projectId={id}
            name={project.name}
            description={project.description}
            logoUrl={projectLogoPublicUrl(project.logo_path)}
            scheduledWeekdays={normalizeScheduledWeekdays(
              project.scheduled_weekdays,
            )}
            projectType={engagement.projectType}
            monthlyHours={engagement.monthlyHours}
          />
          <StoreSetupForm
            projectId={id}
            connection={connection}
            themeGit={themeGit}
          />
          <ProjectDeleteSettings projectId={id} name={project.name} />
        </div>
      </AdminOnly>
    </main>
  );
}
