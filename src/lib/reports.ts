import type { ReportDigest, ReportPeriod } from "@/types/database";

export type ReportPreset = "last_week" | "last_month" | "custom";

export type ReportRangeInput = {
  preset: ReportPreset;
  start?: string | null;
  end?: string | null;
};

export type ReportWindow = {
  period: ReportPeriod;
  periodStart: Date;
  periodEnd: Date;
  label: string;
  title: string;
  startYmd: string;
  endYmd: string;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseYmd(value: string) {
  if (!YMD_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== (month ?? 1) - 1 ||
    date.getDate() !== (day ?? 1)
  ) {
    return null;
  }
  return date;
}

export function parseReportRange(input: {
  preset?: string | null;
  start?: string | null;
  end?: string | null;
}): ReportRangeInput | { error: string } {
  if (
    input.preset !== "last_week" &&
    input.preset !== "last_month" &&
    input.preset !== "custom"
  ) {
    return { error: "Choose last week, last month, or a custom range." };
  }
  if (input.preset === "custom" && (!input.start || !input.end)) {
    return { error: "Choose a start and end date." };
  }
  return {
    preset: input.preset,
    start: input.start,
    end: input.end,
  };
}

export function resolveReportWindow(
  input: ReportRangeInput,
  now = new Date(),
): ReportWindow | { error: string } {
  if (input.preset === "last_week") {
    const thisWeekStart = startOfWeek(now);
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - 7);
    const periodEnd = new Date(thisWeekStart);
    periodEnd.setMilliseconds(-1);
    return {
      period: "week",
      periodStart: start,
      periodEnd,
      label: formatRangeLabel(start, periodEnd),
      title: `Weekly report · ${formatShortDate(start)}–${formatShortDate(periodEnd)}`,
      startYmd: toYmd(start),
      endYmd: toYmd(periodEnd),
    };
  }

  if (input.preset === "last_month") {
    const thisMonthStart = startOfMonth(now);
    const start = new Date(
      thisMonthStart.getFullYear(),
      thisMonthStart.getMonth() - 1,
      1,
    );
    const periodEnd = new Date(thisMonthStart);
    periodEnd.setMilliseconds(-1);
    return {
      period: "month",
      periodStart: start,
      periodEnd,
      label: formatRangeLabel(start, periodEnd),
      title: `Monthly report · ${formatMonth(start)}`,
      startYmd: toYmd(start),
      endYmd: toYmd(periodEnd),
    };
  }

  const start = parseYmd(input.start ?? "");
  const rawEnd = parseYmd(input.end ?? "");
  if (!start || !rawEnd) {
    return { error: "Choose a valid start and end date." };
  }
  if (start > rawEnd) {
    return { error: "The start date must be on or before the end date." };
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (start > today) {
    return { error: "The range cannot start in the future." };
  }

  const periodEnd = endOfDay(rawEnd > today ? today : rawEnd);
  const days =
    Math.round(
      (new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate()).getTime() -
        start.getTime()) /
        86_400_000,
    ) + 1;
  if (days > 366) {
    return { error: "Choose a range of 366 days or fewer." };
  }

  return {
    period: "custom",
    periodStart: start,
    periodEnd,
    label: formatRangeLabel(start, periodEnd),
    title: `Report · ${formatShortDate(start)}–${formatShortDate(periodEnd)}`,
    startYmd: toYmd(start),
    endYmd: toYmd(periodEnd),
  };
}

export function buildDigestFromActivity(
  events: Array<{
    action: string;
    entity_type: string;
    summary: string;
    metadata: Record<string, unknown> | null;
  }>,
): ReportDigest {
  let tasksCreated = 0;
  let tasksCompleted = 0;
  let statusChanges = 0;
  let comments = 0;
  let peopleInvited = 0;
  const completedTasks: string[] = [];
  const highlights: string[] = [];
  const activitySummaries: string[] = [];

  for (const event of events) {
    activitySummaries.push(event.summary);
    const meta = event.metadata ?? {};

    if (event.entity_type === "task" && event.action === "created") {
      tasksCreated += 1;
    }
    if (event.entity_type === "task" && event.action === "status_changed") {
      statusChanges += 1;
      if (meta.to === "done") {
        tasksCompleted += 1;
        const titleMatch = event.summary.match(/Moved “(.+?)” to/);
        if (titleMatch?.[1]) {
          completedTasks.push(titleMatch[1]);
        } else {
          highlights.push(event.summary);
        }
      }
    }
    if (event.entity_type === "comment" && event.action === "created") {
      comments += 1;
    }
    if (event.entity_type === "member" && event.action === "invited") {
      peopleInvited += 1;
    }
  }

  return {
    stats: {
      tasks_created: tasksCreated,
      tasks_completed: tasksCompleted,
      status_changes: statusChanges,
      comments,
      people_invited: peopleInvited,
    },
    highlights,
    completed_tasks: [...new Set(completedTasks)],
    activity_summaries: activitySummaries.slice(0, 80),
  };
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatRangeLabel(start: Date, end: Date) {
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}
