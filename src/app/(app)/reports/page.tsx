import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { HomeWeeklyReports } from "@/components/home-weekly-reports";
import { ProjectStoreView } from "@/components/project-store-view";
import { formatDateTime } from "@/lib/format-date";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { requireSessionUser, getCurrentProfile } from "@/lib/auth";

type ReportRow = {
  id: string;
  project_id: string;
  title: string;
  kind: string | null;
  sent_at: string | null;
  created_at: string;
};

export default async function ReportsPage() {
  const { supabase, user } = await requireSessionUser();
  const profile = await getCurrentProfile();
  const isPlatformAdmin = !!profile?.is_platform_admin;

  const [{ data: projects }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, logo_path")
      .order("name", { ascending: true }),
    supabase
      .from("project_members")
      .select("project_id, role")
      .eq("user_id", user.id),
  ]);

  const rows = projects ?? [];
  const adminIds = new Set(
    isPlatformAdmin
      ? rows.map((project) => project.id)
      : (memberships ?? [])
          .filter((membership) => membership.role === "admin")
          .map((membership) => membership.project_id as string),
  );
  const clientIds = new Set(
    (memberships ?? [])
      .filter((membership) => membership.role === "client")
      .map((membership) => membership.project_id as string),
  );
  const canGenerate = adminIds.size > 0;
  const sharedProjects = rows.filter((project) => !adminIds.has(project.id));
  const managedProjects = rows.filter((project) => adminIds.has(project.id));

  const reportProjectIds = canGenerate
    ? sharedProjects.map((project) => project.id)
    : rows.map((project) => project.id);
  const { data: reportRows } =
    reportProjectIds.length > 0
      ? await supabase
          .from("project_reports")
          .select("id, project_id, title, kind, sent_at, created_at")
          .in("project_id", reportProjectIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const reportsByProject = new Map<string, ReportRow[]>();
  for (const report of reportRows ?? []) {
    const list = reportsByProject.get(report.project_id) ?? [];
    list.push(report);
    reportsByProject.set(report.project_id, list);
  }

  return (
    <div>
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
        Reports
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        {canGenerate
          ? "Open or send a prepared report, or open a project to generate a new one."
          : "Your store, and the reports shared with you."}
      </p>

      {canGenerate ? (
        <div className="mt-6">
          <Suspense fallback={null}>
            <HomeWeeklyReports />
          </Suspense>
          <section className="mt-8">
            <h2 className="text-sm font-medium">Projects</h2>
            <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {managedProjects.length === 0 ? (
                <li className="px-3 py-6 text-sm text-[var(--muted)]">
                  No customers yet.
                </li>
              ) : (
                managedProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/reports/${project.id}`}
                      className="flex items-center gap-2 px-2.5 py-2 hover:bg-[var(--surface-2)] sm:px-3"
                    >
                      <ProjectMark
                        name={project.name}
                        logoUrl={projectLogoPublicUrl(project.logo_path)}
                      />
                      <span className="min-w-0 truncate text-sm">
                        {project.name}
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      ) : null}

      {sharedProjects.map((project) => {
        const reports = reportsByProject.get(project.id) ?? [];
        return (
          <section key={project.id} className="mt-8">
            <h2 className="font-medium">{project.name}</h2>
            {clientIds.has(project.id) ? (
              <div className="mt-4">
                <ProjectStoreView
                  projectId={project.id}
                  isAdmin={false}
                  embedded
                />
              </div>
            ) : null}
            <ReportList projectId={project.id} reports={reports} shared />
          </section>
        );
      })}

      {!canGenerate && rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">
          No reports have been shared with you yet.
        </p>
      ) : null}
    </div>
  );
}

function ProjectMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 shrink-0 rounded border border-[var(--border)] bg-white object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-soft)] text-xs font-medium text-[var(--accent)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ReportList({
  projectId,
  reports,
  shared,
}: {
  projectId: string;
  reports: ReportRow[];
  shared: boolean;
}) {
  return (
    <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {reports.length === 0 ? (
        <li className="py-8 text-center text-sm text-[var(--muted)]">
          {shared
            ? "No reports have been shared with you yet."
            : "No reports yet."}
        </li>
      ) : (
        reports.map((report) => (
          <li key={report.id}>
            <Link
              href={`/reports/${projectId}/${report.id}`}
              className="flex items-start justify-between gap-4 px-1 py-4 hover:bg-[var(--surface)]/60"
            >
              <div>
                <p className="font-medium">{report.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {report.kind === "store" ? "Store" : "Performance"} · Created{" "}
                  {formatDateTime(report.created_at)}
                  {report.sent_at
                    ? ` · Sent ${formatDateTime(report.sent_at)}`
                    : " · Draft"}
                </p>
              </div>
              <span className="text-sm text-[var(--accent)]">Open</span>
            </Link>
          </li>
        ))
      )}
    </ul>
  );
}
