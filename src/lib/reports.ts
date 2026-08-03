import type { ReportDigest, ReportPeriod } from "@/types/database";

export type ReportPreset = "this_week" | "last_week" | "this_month" | "last_month";

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

export function resolveReportWindow(preset: ReportPreset, now = new Date()) {
  const end = new Date(now);

  if (preset === "this_week") {
    const start = startOfWeek(now);
    return {
      period: "week" as ReportPeriod,
      periodStart: start,
      periodEnd: end,
      label: formatRangeLabel(start, end),
      title: `Weekly report · ${formatShortDate(start)}–${formatShortDate(end)}`,
    };
  }

  if (preset === "last_week") {
    const thisWeekStart = startOfWeek(now);
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - 7);
    const periodEnd = new Date(thisWeekStart);
    periodEnd.setMilliseconds(-1);
    return {
      period: "week" as ReportPeriod,
      periodStart: start,
      periodEnd,
      label: formatRangeLabel(start, periodEnd),
      title: `Weekly report · ${formatShortDate(start)}–${formatShortDate(periodEnd)}`,
    };
  }

  if (preset === "this_month") {
    const start = startOfMonth(now);
    return {
      period: "month" as ReportPeriod,
      periodStart: start,
      periodEnd: end,
      label: formatRangeLabel(start, end),
      title: `Monthly report · ${formatMonth(start)}`,
    };
  }

  const thisMonthStart = startOfMonth(now);
  const start = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() - 1, 1);
  const periodEnd = new Date(thisMonthStart);
  periodEnd.setMilliseconds(-1);
  return {
    period: "month" as ReportPeriod,
    periodStart: start,
    periodEnd,
    label: formatRangeLabel(start, periodEnd),
    title: `Monthly report · ${formatMonth(start)}`,
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
