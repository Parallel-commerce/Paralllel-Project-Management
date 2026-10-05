import Image from "next/image";
import Link from "next/link";

import { formatDateTime } from "@/lib/format-date";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import { dueGmtMonthWindow } from "@/lib/reports";
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

type PreparedChoice = {
  key: string;
  label: string;
  title: string | null;
  openHref: string | null;
  reportId: string | null;
  sentLabel: string | null;
  note: string | null;
  state: "ready" | "sent" | "preparing" | "failed" | "waiting";
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
    .select("project_id, projects(id, name, logo_path, auto_weekly_report, auto_monthly_report)")
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
        autoWeekly: project.auto_weekly_report !== false,
        autoMonthly: project.auto_monthly_report !== false,
      };
    })
    .filter((store): store is NonNullable<typeof store> => !!store);

  if (stores.length === 0) return null;

  const projectIds = stores.map((store) => store.projectId);
  const dueMonth = dueGmtMonthWindow();
  const recentStoreSince = new Date();
  recentStoreSince.setUTCDate(recentStoreSince.getUTCDate() - 45);
  const [
    { data: runRows },
    { data: recipientRows },
    { data: progressRows },
    { data: storeReportRows },
  ] = await Promise.all([
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
    supabase
      .from("project_reports")
      .select("id, project_id, title, sent_at, period, created_at")
      .in("project_id", projectIds)
      .eq("kind", "store")
      .in("period", ["week", "month"])
      .gte("created_at", recentStoreSince.toISOString())
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
  const latestStoreReport = new Map<
    string,
    NonNullable<typeof storeReportRows>[number]
  >();
  for (const report of storeReportRows ?? []) {
    const key = `${report.project_id}:${report.period}`;
    if (!latestStoreReport.has(key)) latestStoreReport.set(key, report);
  }
  const recipientCount = new Map<string, number>();
  for (const row of recipientRows ?? []) {
    const projectId = row.project_id as string;
    recipientCount.set(projectId, (recipientCount.get(projectId) ?? 0) + 1);
  }

  const cardsByPeriod = new Map<ScheduledStoreReportPeriod, StoreCard[]>();
  for (const period of periods) {
    const cards = chosen
      .filter((item) => item.period === period)
      .map(({ store, run, period }) => {
        const linked = run?.report_id ? reportById.get(run.report_id) : undefined;
        const candidate = latestStoreReport.get(`${store.projectId}:${period}`);
        const candidateAge = candidate
          ? Date.now() - new Date(candidate.created_at).getTime()
          : Number.POSITIVE_INFINITY;
        const candidateFresh =
          period === "month"
            ? candidateAge <= 40 * 24 * 60 * 60 * 1000
            : candidateAge <= 14 * 24 * 60 * 60 * 1000;
        const fallback =
          !linked &&
          run?.status !== "running" &&
          run?.status !== "failed" &&
          candidateFresh
            ? candidate
            : undefined;
        const report = linked ?? fallback;
        return {
          projectId: store.projectId,
          projectName: store.projectName,
          logoUrl: store.logoUrl,
          reportId: report?.id ?? null,
          title: report?.title ?? null,
          score: null,
          sentAt: report?.sent_at ?? null,
          recipientCount: recipientCount.get(store.projectId) ?? 0,
          status: report ? "generated" : reportRunStatus(run?.status),
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
      const choices = [
        store.autoWeekly
          ? menuChoice(weekCards.get(store.projectId), PERIOD_COPY.week, "Weekly")
          : null,
        store.autoMonthly
          ? menuChoice(
              monthCards.get(store.projectId),
              PERIOD_COPY.month,
              "Monthly",
            )
          : null,
        store.autoMonthly
          ? menuChoice(
              performanceByProject.get(store.projectId),
              PERFORMANCE_COPY,
              "Performance",
            )
          : null,
      ].filter((choice): choice is PreparedChoice =>
        !!choice && (choice.key !== "Performance" || choice.state !== "waiting"),
      );
      return {
        ...store,
        choices,
        rank: choices.some((choice) => choice.state === "ready") ? 0 : 1,
      };
    })
    .filter((customer) => customer.choices.length > 0)
    .sort((a, b) => a.rank - b.rank || a.projectName.localeCompare(b.projectName));

  const readyCount = customers.reduce(
    (count, customer) =>
      count +
      customer.choices.filter((choice) => choice.state === "ready").length,
    0,
  );

  if (customers.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-medium">Prepared</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Turn on weekly or monthly reports in a customer’s settings.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Prepared</h2>
        {readyCount > 0 ? (
          <p className="text-xs text-[var(--muted)]">{readyCount} ready</p>
        ) : null}
      </div>
      <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {customers.map((customer) => (
          <li
            key={customer.projectId}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-2.5 py-1.5 sm:px-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              {customer.logoUrl ? (
                <Image
                  src={customer.logoUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 rounded border border-[var(--border)] bg-white object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-soft)] text-xs font-medium text-[var(--accent)]">
                  {customer.projectName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <Link
                href={`/reports/${customer.projectId}`}
                className="truncate text-sm hover:text-[var(--accent)]"
              >
                {customer.projectName}
              </Link>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {customer.choices.map((choice) => (
                <PreparedReportLink key={choice.key} choice={choice} />
              ))}
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
  label: string,
): PreparedChoice {
  const staleRunning =
    card?.status === "running" &&
    !!card.updatedAt &&
    Date.now() - new Date(card.updatedAt).getTime() > 20 * 60 * 1000;
  const reportId = card?.reportId ?? null;
  const sent = !!card?.sentAt;
  const preparing = card?.status === "running" && !staleRunning;
  const failed = !reportId && (card?.status === "failed" || staleRunning);
  const note = reportId
    ? null
    : preparing
      ? copy.preparing
      : failed
        ? card?.error || (staleRunning ? copy.stale : copy.failed)
        : copy.waiting;

  return {
    key: label,
    label,
    title: reportId ? card?.title ?? null : null,
    openHref: reportId && card ? `/reports/${card.projectId}/${reportId}` : null,
    reportId,
    sentLabel: sent && card?.sentAt ? `Sent ${formatDateTime(card.sentAt)}` : null,
    note,
    state: reportId
      ? sent
        ? "sent"
        : "ready"
      : preparing
        ? "preparing"
        : failed
          ? "failed"
          : "waiting",
  };
}

const STATE_LABEL = {
  ready: "Ready",
  sent: "Sent",
  preparing: "Preparing",
  failed: "Failed",
  waiting: "Waiting",
} as const;

function PreparedReportLink({ choice }: { choice: PreparedChoice }) {
  const statusClass =
    choice.state === "ready"
      ? "text-[var(--accent)]"
      : choice.state === "failed"
        ? "text-[var(--danger)]"
        : "text-[var(--muted)]";
  const className =
    "inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 py-0.5 text-xs font-medium";
  const body = (
    <>
      {choice.label}
      <span className={`font-medium ${statusClass}`}>
        {STATE_LABEL[choice.state]}
      </span>
    </>
  );

  if (!choice.openHref) {
    return (
      <span className={className} title={choice.note ?? undefined}>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={choice.openHref}
      title={choice.sentLabel ?? choice.title ?? undefined}
      className={`${className} hover:bg-[var(--surface-2)]`}
    >
      {body}
    </Link>
  );
}
