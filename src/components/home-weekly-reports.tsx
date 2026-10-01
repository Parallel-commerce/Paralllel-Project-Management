import Image from "next/image";
import Link from "next/link";

import { HomeWeeklyReportSend } from "@/components/home-weekly-report-send";
import { formatDateTime } from "@/lib/format-date";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { asStoreReportDigest } from "@/lib/store-report";
import { createClient } from "@/lib/supabase/server";
import type {
  ScheduledStoreReportPeriod,
  WeeklyStoreReportRun,
} from "@/types/database";

type StoreCard = {
  projectId: string;
  projectName: string;
  logoUrl: string | null;
  reportId: string | null;
  title: string | null;
  score: number | null;
  sentAt: string | null;
  recipientCount: number;
  status: WeeklyStoreReportRun["status"] | "waiting";
  error: string | null;
  updatedAt: string | null;
};

function pickRun(runs: WeeklyStoreReportRun[]) {
  if (runs.length === 0) return null;
  const latestWeek = [...runs].sort((a, b) =>
    b.week_start.localeCompare(a.week_start),
  )[0]?.week_start;
  const latest = runs.filter((run) => run.week_start === latestWeek);
  return (
    latest.find(
      (run) =>
        run.report_id &&
        (run.status === "generated" || run.status === "skipped"),
    ) ??
    latest[0] ??
    null
  );
}

function reportRunStatus(
  status: string | null | undefined,
): StoreCard["status"] {
  if (
    status === "running" ||
    status === "generated" ||
    status === "skipped" ||
    status === "failed"
  ) {
    return status;
  }
  return "waiting";
}

const PERIOD_COPY: Record<
  ScheduledStoreReportPeriod,
  {
    title: string;
    blurb: string;
    preparing: string;
    failed: string;
    waiting: string;
    stale: string;
  }
> = {
  week: {
    title: "This week's store reports",
    blurb: "Prepared every Monday at 7:00.",
    preparing: "Preparing the weekly report…",
    failed: "This week's report was not prepared.",
    waiting: "Waiting for Monday at 7:00.",
    stale: "Preparation stopped. It will try again on Monday.",
  },
  month: {
    title: "Last month's store reports",
    blurb: "Prepared on the 1st at 7:00, for the previous month.",
    preparing: "Preparing the monthly report…",
    failed: "Last month's report was not prepared.",
    waiting: "Waiting for the 1st at 7:00.",
    stale: "Preparation stopped. It will try again on the 1st.",
  },
};

function cardRank(card: StoreCard) {
  if (card.reportId && !card.sentAt) return 0;
  if (card.status === "failed") return 1;
  if (card.status === "running") return 2;
  if (card.status === "waiting") return 3;
  return 4;
}

export async function HomeWeeklyReports() {
  const supabase = await createClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);

  const { data: connections } = await supabase
    .from("project_shopify_connections")
    .select("project_id, projects(id, name, logo_path)")
    .not("access_token_ciphertext", "is", null);

  const stores = (connections ?? [])
    .map((row) => {
      const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      const projectId = row.project_id as string;
      if (!projectId || !project?.name) return null;
      return {
        projectId,
        projectName: project.name as string,
        logoUrl: projectLogoPublicUrl(project.logo_path as string | null),
      };
    })
    .filter((store): store is NonNullable<typeof store> => !!store);

  if (stores.length === 0) return null;

  const projectIds = stores.map((store) => store.projectId);
  const [{ data: runRows }, { data: recipientRows }] = await Promise.all([
    supabase
      .from("weekly_store_report_runs")
      .select(
        "id, project_id, period, week_start, week_end, report_id, status, error, attempts, created_at, updated_at",
      )
      .in("project_id", projectIds)
      .gte("week_start", since.toISOString().slice(0, 10)),
    supabase
      .from("project_report_recipients")
      .select("project_id")
      .in("project_id", projectIds),
  ]);

  const runsByProject = new Map<string, WeeklyStoreReportRun[]>();
  for (const row of runRows ?? []) {
    const run = row as WeeklyStoreReportRun;
    const list = runsByProject.get(run.project_id) ?? [];
    list.push(run);
    runsByProject.set(run.project_id, list);
  }

  const periods: ScheduledStoreReportPeriod[] = ["week", "month"];
  const chosen = periods.flatMap((period) =>
    stores.map((store) => ({
      period,
      store,
      run: pickRun(
        (runsByProject.get(store.projectId) ?? []).filter(
          (run) => (run.period ?? "week") === period,
        ),
      ),
    })),
  );
  const reportIds = [
    ...new Set(
      chosen
        .map((item) => item.run?.report_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const { data: reports } =
    reportIds.length > 0
      ? await supabase
          .from("project_reports")
          .select("id, title, sent_at, digest, kind")
          .in("id", reportIds)
      : { data: [] };

  const reportById = new Map((reports ?? []).map((report) => [report.id, report]));
  const recipientCount = new Map<string, number>();
  for (const row of recipientRows ?? []) {
    const projectId = row.project_id as string;
    recipientCount.set(projectId, (recipientCount.get(projectId) ?? 0) + 1);
  }

  const cardsByPeriod = new Map<ScheduledStoreReportPeriod, StoreCard[]>();
  for (const period of periods) {
    const cards = chosen
      .filter((item) => item.period === period)
      .map(({ store, run }) => {
        const report = run?.report_id ? reportById.get(run.report_id) : undefined;
        const digest = report
          ? asStoreReportDigest(report.digest, report.kind)
          : null;
        return {
          projectId: store.projectId,
          projectName: store.projectName,
          logoUrl: store.logoUrl,
          reportId: report?.id ?? null,
          title: (report?.title as string | undefined) ?? null,
          score: digest?.scorecard.score ?? null,
          sentAt: (report?.sent_at as string | null | undefined) ?? null,
          recipientCount: recipientCount.get(store.projectId) ?? 0,
          status: reportRunStatus(run?.status),
          error: run?.error ?? null,
          updatedAt: run?.updated_at ?? null,
        };
      })
      .sort((a, b) => {
        const byRank = cardRank(a) - cardRank(b);
        if (byRank !== 0) return byRank;
        return a.projectName.localeCompare(b.projectName);
      });
    cardsByPeriod.set(period, cards);
  }

  return (
    <>
      {periods.map((period, index) => (
        <ReportPeriodSection
          key={period}
          period={period}
          cards={cardsByPeriod.get(period) ?? []}
          className={index === 0 ? "mt-8" : "mt-6"}
        />
      ))}
    </>
  );
}

function ReportPeriodSection({
  period,
  cards,
  className,
}: {
  period: ScheduledStoreReportPeriod;
  cards: StoreCard[];
  className: string;
}) {
  const copy = PERIOD_COPY[period];
  const readyCount = cards.filter((card) => card.reportId && !card.sentAt).length;

  return (
    <section className={className}>
      <div>
        <h2 className="font-medium">{copy.title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {copy.blurb} Open a report to review it, or send it to the saved
          recipients
          {readyCount > 0 ? ` (${readyCount} ready)` : ""}.
        </p>
      </div>
      <ul className="mt-3 space-y-2 sm:mt-4">
        {cards.map((card) => (
          <StoreReportCard key={card.projectId} card={card} copy={copy} />
        ))}
      </ul>
    </section>
  );
}

function StoreReportCard({
  card,
  copy,
}: {
  card: StoreCard;
  copy: (typeof PERIOD_COPY)["week"];
}) {
  const staleRunning =
    card.status === "running" &&
    !!card.updatedAt &&
    Date.now() - new Date(card.updatedAt).getTime() > 20 * 60 * 1000;
  const canSend = !!card.reportId && !card.sentAt && card.recipientCount > 0;

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
      <div className="flex items-start gap-3">
        {card.logoUrl ? (
          <Image
            src={card.logoUrl}
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border)] bg-white object-cover sm:h-10 sm:w-10"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-sm text-[var(--accent)] sm:h-10 sm:w-10">
            {card.projectName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium tracking-tight">{card.projectName}</p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {card.title ??
              (card.status === "running" && !staleRunning
                ? copy.preparing
                : card.status === "failed" || staleRunning
                  ? copy.failed
                  : copy.waiting)}
          </p>
          {card.score != null ? (
            <p className="mt-1 text-sm">Score {card.score}%</p>
          ) : null}
          {card.sentAt ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Sent {formatDateTime(card.sentAt)}
            </p>
          ) : null}
          {card.error && (card.status === "failed" || staleRunning) ? (
            <p className="mt-1 text-sm text-[var(--danger)]">{card.error}</p>
          ) : null}
          {staleRunning && !card.error ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{copy.stale}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-12 sm:pl-[3.25rem]">
        {card.reportId ? (
          <Link
            href={`/projects/${card.projectId}/reports/${card.reportId}`}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            View
          </Link>
        ) : (
          <Link
            href={`/projects/${card.projectId}/reports`}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Reports
          </Link>
        )}
        {canSend && card.reportId ? (
          <HomeWeeklyReportSend
            projectId={card.projectId}
            reportId={card.reportId}
            projectName={card.projectName}
          />
        ) : null}
        {card.reportId && !card.sentAt && card.recipientCount === 0 ? (
          <Link
            href={`/projects/${card.projectId}/settings`}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Add recipients
          </Link>
        ) : null}
        {canSend ? (
          <span className="text-xs text-[var(--muted)]">
            {card.recipientCount} saved{" "}
            {card.recipientCount === 1 ? "recipient" : "recipients"}
          </span>
        ) : null}
      </div>
    </li>
  );
}
