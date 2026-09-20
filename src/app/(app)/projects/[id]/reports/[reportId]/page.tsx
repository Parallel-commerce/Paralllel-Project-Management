import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReportEditor } from "@/components/report-editor";
import { StoreReportScorecard } from "@/components/store-report-scorecard";
import { formatDateTime } from "@/lib/format-date";
import { asStoreReportDigest } from "@/lib/store-report";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRole, ReportDigest } from "@/types/database";

export default async function ProjectReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
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

  const { data: report } = await supabase
    .from("project_reports")
    .select(
      "id, title, narrative, digest, kind, period, period_start, period_end, created_at, sent_at, sent_to",
    )
    .eq("id", reportId)
    .eq("project_id", id)
    .maybeSingle();

  if (!project || !report) {
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
  const storeDigest = asStoreReportDigest(report.digest, report.kind);
  const progressDigest =
    storeDigest ||
    !report.digest ||
    typeof report.digest !== "object" ||
    !("stats" in report.digest)
      ? null
      : (report.digest as ReportDigest);

  const { data: clientMembers } = isAdmin
    ? await supabase
        .from("project_members")
        .select("user_id, profiles(email, full_name)")
        .eq("project_id", id)
        .eq("role", "client")
    : { data: [] };

  const clients =
    clientMembers?.flatMap((member) => {
      const profile = Array.isArray(member.profiles)
        ? member.profiles[0]
        : member.profiles;
      const email = profile?.email as string | undefined;
      if (!email) return [];
      return [
        {
          email,
          label:
            (profile?.full_name as string | null) ||
            email.split("@")[0] ||
            email,
        },
      ];
    }) ?? [];

  return (
    <main className="app-container py-6 sm:py-10">
        <Link
          href={`/projects/${id}/reports`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Reports
        </Link>
        <h1 className="mt-3 font-display text-3xl tracking-tight">
          {report.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {project.name} · Created {formatDateTime(report.created_at)}
          {report.sent_at ? ` · Sent ${formatDateTime(report.sent_at)}` : " · Draft"}
        </p>

        {isAdmin && storeDigest?.warnings.length ? (
          <p className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--danger)]">
            {storeDigest.warnings.join(" ")}
          </p>
        ) : null}

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-medium">Narrative</h2>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
            {report.narrative || "No narrative yet."}
          </div>
        </section>

        {storeDigest ? (
          <StoreReportScorecard digest={storeDigest} />
        ) : progressDigest ? (
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-medium">Snapshot</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[var(--muted)]">Completed</dt>
              <dd className="mt-1 text-lg font-medium">
                {progressDigest.stats.tasks_completed}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Created</dt>
              <dd className="mt-1 text-lg font-medium">
                {progressDigest.stats.tasks_created}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Comments</dt>
              <dd className="mt-1 text-lg font-medium">
                {progressDigest.stats.comments}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Status moves</dt>
              <dd className="mt-1 text-lg font-medium">
                {progressDigest.stats.status_changes}
              </dd>
            </div>
          </dl>
          {progressDigest.completed_tasks.length > 0 ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              {progressDigest.completed_tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          ) : null}
        </section>
        ) : null}

        {report.sent_to.length > 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Sent to: {report.sent_to.join(", ")}
          </p>
        ) : null}

        {isAdmin ? (
          <div className="mt-8">
            <ReportEditor
              projectId={id}
              reportId={report.id}
              title={report.title}
              narrative={report.narrative}
              clients={clients}
              sentTo={report.sent_to}
              kind={storeDigest ? "store" : "progress"}
            />
          </div>
        ) : null}
      </main>
  );
}
