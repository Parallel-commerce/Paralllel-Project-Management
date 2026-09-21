import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminOnly } from "@/components/admin-only";
import { ReportActionsToTasks } from "@/components/report-actions-to-tasks";
import { ReportEditor } from "@/components/report-editor";
import { ReportLetter } from "@/components/report-letter";
import { StoreReportSpeedcard } from "@/components/store-report-speedcard";
import { formatDateTime } from "@/lib/format-date";
import { collectReportActions } from "@/lib/report-actions";
import { asStoreReportDigest } from "@/lib/store-report";
import { loadStoreReportSpeed } from "@/lib/store-report-speed";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRole, ReportDigest } from "@/types/database";

export default async function ProjectReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; reportId: string }>;
  searchParams: Promise<{ seeded?: string }>;
}) {
  const { id, reportId } = await params;
  const { seeded } = await searchParams;
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

  const [
    { data: clientMembers },
    { data: lists },
    { data: actionTasks },
    speedFallback,
  ] = await Promise.all([
      isAdmin
        ? supabase
            .from("project_members")
            .select("user_id, profiles(email, full_name)")
            .eq("project_id", id)
            .eq("role", "client")
        : Promise.resolve({ data: [] as { user_id: string; profiles: unknown }[] }),
      isAdmin
        ? supabase
            .from("lists")
            .select("id, name")
            .eq("project_id", id)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      isAdmin
        ? supabase
            .from("tasks")
            .select("id, key, list_id, source_action_key")
            .eq("project_id", id)
            .eq("source_report_id", reportId)
        : Promise.resolve({
            data: [] as {
              id: string;
              key: string;
              list_id: string;
              source_action_key: string | null;
            }[],
          }),
      storeDigest && !storeDigest.speed
        ? loadStoreReportSpeed(
            supabase,
            id,
            storeDigest.week_end,
            storeDigest.previous_week_end,
          )
        : Promise.resolve(storeDigest?.speed ?? null),
    ]);

  const reportSpeed = storeDigest?.speed ?? speedFallback;
  const reportActions = collectReportActions(report.narrative, reportSpeed);

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
        <p className="mt-3 text-sm text-[var(--muted)]">
          {project.name} · Created {formatDateTime(report.created_at)}
          {report.sent_at ? ` · Sent ${formatDateTime(report.sent_at)}` : " · Draft"}
        </p>

        {isAdmin && seeded === "1" ? (
          <AdminOnly className="mt-4">
            <p className="px-3 py-2 text-sm text-[var(--muted)]">
              The previous period was not in the archive, so we drafted that
              report first. It is in the{" "}
              <Link
                href={`/projects/${id}/reports`}
                className="text-[var(--accent)] hover:underline"
              >
                archive
              </Link>
              .
            </p>
          </AdminOnly>
        ) : null}

        {isAdmin && storeDigest?.warnings.length ? (
          <AdminOnly className="mt-4">
            <p className="px-3 py-2 text-sm text-[var(--danger)]">
              {storeDigest.warnings.join(" ")}
            </p>
          </AdminOnly>
        ) : null}

        <ReportLetter
          projectName={project.name}
          title={report.title}
          narrative={report.narrative}
        />

        {isAdmin && reportActions.length > 0 ? (
          <AdminOnly className="mt-6">
            <ReportActionsToTasks
              projectId={id}
              reportId={report.id}
              actions={reportActions}
              lists={lists ?? []}
              existingTasks={(actionTasks ?? []).flatMap((task) => {
                if (!task.source_action_key) return [];
                return [
                  {
                    key: task.source_action_key,
                    taskId: task.id,
                    taskKey: task.key,
                    listId: task.list_id,
                  },
                ];
              })}
            />
          </AdminOnly>
        ) : null}

        {storeDigest && reportSpeed ? (
          <StoreReportSpeedcard speed={reportSpeed} />
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
          <AdminOnly className="mt-8">
            <div className="p-5">
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
          </AdminOnly>
        ) : null}
      </main>
  );
}
