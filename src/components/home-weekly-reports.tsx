import Image from "next/image";

import {
  HomeReportMenu,
  type HomeReportChoice,
} from "@/components/home-report-menu";
import { formatDateTime } from "@/lib/format-date";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { dueGmtMonthWindow } from "@/lib/reports";
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
    blurb: "Prepared on the 1st at 7:00 GMT, for the previous month.",
    preparing: "Preparing the monthly report…",
    failed: "Last month's report was not prepared.",
    waiting: "Waiting for the 1st at 7:00 GMT.",
    stale: "Preparation stopped. It will try again at 8:00 GMT.",
  },
};

const PERFORMANCE_COPY = {
  title: "Last month's performance reports",
  blurb: "Prepared on the 1st at 7:00 GMT, with the store report.",
  preparing: "Preparing the performance report…",
  failed: "Last month's performance report was not prepared.",
  waiting: "Waiting for the 1st at 7:00 GMT.",
  stale: "Preparation stopped. It will try again at 8:00 GMT.",
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
  const dueMonth = dueGmtMonthWindow();
  const [{ data: runRows }, { data: recipientRows }, { data: progressRows }] =
    await Promise.all([
    supabase
      .from("weekly_store_report_runs")
      .select(
        "id, project_id, period, report_kind, week_start, week_end, report_id, status, error, attempts, created_at, updated_at",
      )
      .in("project_id", projectIds)
      .gte("week_start", since.toISOString().slice(0, 10)),
    supabase
      .from("project_report_recipients")
      .select("project_id")
      .in("project_id", projectIds),
    supabase
      .from("project_reports")
      .select("id, project_id, title, sent_at")
      .in("project_id", projectIds)
      .eq("kind", "progress")
      .eq("period", "month")
      .eq("title", dueMonth.title)
      .order("created_at", { ascending: false }),
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
          (run) =>
            (run.report_kind ?? "store") === "store" &&
            (run.period ?? "week") === period,
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

  const progressByProject = new Map<
    string,
    { id: string; title: string; sent_at: string | null }
  >();
  for (const row of progressRows ?? []) {
    if (!progressByProject.has(row.project_id)) {
      progressByProject.set(row.project_id, row);
    }
  }

  const performanceCards = stores
    .map((store) => {
      const run = pickRun(
        (runsByProject.get(store.projectId) ?? []).filter(
          (item) =>
            item.report_kind === "progress" &&
            item.period === "month" &&
            item.week_start === dueMonth.startYmd,
        ),
      );
      const linked = run?.report_id ? reportById.get(run.report_id) : undefined;
      const existing = progressByProject.get(store.projectId);
      const reportId = linked?.id ?? existing?.id ?? null;
      const sentAt =
        (linked?.sent_at as string | null | undefined) ??
        existing?.sent_at ??
        null;
      return {
        projectId: store.projectId,
        projectName: store.projectName,
        logoUrl: store.logoUrl,
        reportId,
        title: reportId ? (linked?.title as string | undefined) ?? existing?.title ?? dueMonth.title : null,
        score: null,
        sentAt,
        recipientCount: recipientCount.get(store.projectId) ?? 0,
        status: reportId
          ? run?.status === "running"
            ? ("running" as const)
            : ("generated" as const)
          : reportRunStatus(run?.status),
        error: run?.error ?? null,
        updatedAt: run?.updated_at ?? null,
      };
    })
    .sort((a, b) => {
      const byRank = cardRank(a) - cardRank(b);
      if (byRank !== 0) return byRank;
      return a.projectName.localeCompare(b.projectName);
    });

  const weekCards = new Map(
    (cardsByPeriod.get("week") ?? []).map((card) => [card.projectId, card]),
  );
  const monthCards = new Map(
    (cardsByPeriod.get("month") ?? []).map((card) => [card.projectId, card]),
  );
  const performanceByProject = new Map(
    performanceCards.map((card) => [card.projectId, card]),
  );

  const customers = stores
    .map((store) => {
      const storeChoices = [
        menuChoice(weekCards.get(store.projectId), PERIOD_COPY.week, "This week"),
        menuChoice(monthCards.get(store.projectId), PERIOD_COPY.month, "Last month"),
      ];
      const performanceChoices = [
        menuChoice(
          performanceByProject.get(store.projectId),
          PERFORMANCE_COPY,
          null,
        ),
      ];
      return {
        ...store,
        storeChoices,
        performanceChoices,
        rank: [...storeChoices, ...performanceChoices].some((choice) => choice.canSend)
          ? 0
          : 1,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.projectName.localeCompare(b.projectName));

  const readyCount = customers.filter((customer) => customer.rank === 0).length;

  return (
    <section className="mt-8">
      <div>
        <h2 className="font-medium">Reports</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Store reports are prepared on Monday at 7:00, and again on the 1st at
          7:00 GMT with the performance report. Open a report to review it, or
          send it to the saved recipients
          {readyCount > 0 ? ` (${readyCount} ready)` : ""}.
        </p>
      </div>
      <ul className="mt-3 space-y-2 sm:mt-4">
        {customers.map((customer) => (
          <li
            key={customer.projectId}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {customer.logoUrl ? (
                  <Image
                    src={customer.logoUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border)] bg-white object-cover sm:h-10 sm:w-10"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-sm text-[var(--accent)] sm:h-10 sm:w-10">
                    {customer.projectName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <p className="truncate font-medium tracking-tight">
                  {customer.projectName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pl-12 sm:pl-0">
                <HomeReportMenu
                  projectId={customer.projectId}
                  projectName={customer.projectName}
                  label="Store report"
                  choices={customer.storeChoices}
                />
                <HomeReportMenu
                  projectId={customer.projectId}
                  projectName={customer.projectName}
                  label="Performance report"
                  choices={customer.performanceChoices}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function menuChoice(
  card: StoreCard | undefined,
  copy: (typeof PERIOD_COPY)["week"],
  label: string | null,
): HomeReportChoice {
  const staleRunning =
    card?.status === "running" &&
    !!card.updatedAt &&
    Date.now() - new Date(card.updatedAt).getTime() > 20 * 60 * 1000;
  const reportId = card?.reportId ?? null;
  const note = reportId
    ? null
    : card?.status === "running" && !staleRunning
      ? copy.preparing
      : card?.status === "failed" || staleRunning
        ? card?.error || copy.failed
        : copy.waiting;

  return {
    key: label ?? "performance",
    label,
    title: reportId ? card?.title ?? null : null,
    openHref: reportId
      ? `/projects/${card?.projectId}/reports/${reportId}`
      : null,
    reportId,
    sentLabel: card?.sentAt ? `Sent ${formatDateTime(card.sentAt)}` : null,
    note: staleRunning && !card?.error ? copy.stale : note,
    canSend: !!reportId && !card?.sentAt && (card?.recipientCount ?? 0) > 0,
    needsRecipients:
      !!reportId && !card?.sentAt && (card?.recipientCount ?? 0) === 0,
  };
}
