import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminOnly } from "@/components/admin-only";
import { GenerateReportForm } from "@/components/generate-report-form";
import { formatDateTime } from "@/lib/format-date";
import { resolveReportWindow, type ReportWindow } from "@/lib/reports";
import { toPublicConnection } from "@/lib/shopify/connection";
import { createClient } from "@/lib/supabase/server";
import type {
  ProjectRole,
  ProjectShopifyConnection,
  ReportKind,
} from "@/types/database";

export const maxDuration = 300;

export default async function ProjectReportsPage({
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
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!project) {
    notFound();
  }

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
  const isAdmin = role === "admin" || !!profile?.is_platform_admin;

  const [{ data: reports }, { data: connectionRow }] = await Promise.all([
    supabase
      .from("project_reports")
      .select("id, title, period, kind, sent_at, created_at, period_start, period_end")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    isAdmin
      ? supabase
          .from("project_shopify_connections")
          .select("*")
          .eq("project_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const connection = connectionRow
    ? toPublicConnection(connectionRow as ProjectShopifyConnection)
    : null;
  const storeConnected = Boolean(connection?.has_access_token);
  const missingReportsScope =
    storeConnected &&
    !connection?.scopes?.split(/[,\s]+/).includes("read_reports");
  const weekBeforeLast = resolveReportWindow({ preset: "week_before_last" });
  const monthBeforeLast = resolveReportWindow({ preset: "month_before_last" });
  const weekComparisonLabel =
    "error" in weekBeforeLast ? null : weekBeforeLast.label;
  const monthComparisonLabel =
    "error" in monthBeforeLast ? null : monthBeforeLast.label;
  const missingWeekComparisonStoreReport = !coversStoreReportPeriod(
    reports ?? [],
    weekBeforeLast,
  );
  const missingMonthComparisonStoreReport = !coversStoreReportPeriod(
    reports ?? [],
    monthBeforeLast,
  );

  return (
    <main className="app-container py-6 sm:py-10">
        <Link
          href={`/projects/${id}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-3 font-display text-3xl tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {isAdmin
            ? "Generate performance reports from project activity, or store reports from Shopify."
            : "Shared reports for this project."}{" "}
          {isAdmin ? (
            <Link
              href={`/projects/${id}/store`}
              className="text-[var(--accent)] hover:underline"
            >
              Open Store
            </Link>
          ) : null}
        </p>

        <div className="mt-8 space-y-8">
          {isAdmin ? (
            <AdminOnly>
              <GenerateReportForm
                projectId={id}
                storeConnected={storeConnected}
                missingReportsScope={missingReportsScope}
                missingWeekComparisonStoreReport={missingWeekComparisonStoreReport}
                weekComparisonLabel={weekComparisonLabel}
                missingMonthComparisonStoreReport={missingMonthComparisonStoreReport}
                monthComparisonLabel={monthComparisonLabel}
              />
            </AdminOnly>
          ) : null}

          <section>
            <h2 className="font-medium">
              {isAdmin ? "Archive" : "Shared with you"}
            </h2>
            <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {(reports ?? []).length === 0 ? (
                <li className="py-8 text-center text-sm text-[var(--muted)]">
                  {isAdmin
                    ? "No reports yet. Generate one above."
                    : "No reports have been shared with you yet."}
                </li>
              ) : (
                (reports ?? []).map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/projects/${id}/reports/${report.id}`}
                      className="flex items-start justify-between gap-4 px-1 py-4 hover:bg-[var(--surface)]/60"
                    >
                      <div>
                        <p className="font-medium">{report.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {reportKindLabel(report.kind)} · Created{" "}
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
          </section>
        </div>
      </main>
  );
}

function reportKindLabel(kind: ReportKind | string | null | undefined) {
  return kind === "store" ? "Store" : "Performance";
}

function coversStoreReportPeriod(
  reports: Array<{
    kind: string | null;
    period_start: string | null;
    period_end: string | null;
  }>,
  window: ReportWindow | { error: string },
) {
  if ("error" in window) return true;
  return reports.some(
    (report) =>
      report.kind === "store" &&
      report.period_start?.slice(0, 10) === window.startYmd &&
      report.period_end?.slice(0, 10) === window.endYmd,
  );
}
