import {
  endOfWeek,
  format,
  isSameWeek,
  isThisWeek,
  isValid,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";

const WEEK_STARTS_ON_MONDAY = { weekStartsOn: 1 as const };

export type CompletedWeekGroup<T> = {
  key: string;
  title: string;
  range: string;
  tasks: T[];
};

function completedDate(task: {
  completed_at: string | null;
  updated_at: string;
}) {
  const raw = task.completed_at ?? task.updated_at;
  if (!raw) return null;
  const date = parseISO(raw);
  return isValid(date) ? date : null;
}

function formatWeekRange(monday: Date, sunday: Date, now = new Date()) {
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  if (!sameYear) {
    return `${format(monday, "EEE d MMM yyyy")} – ${format(sunday, "EEE d MMM yyyy")}`;
  }
  if (monday.getFullYear() !== now.getFullYear()) {
    return `${format(monday, "EEE d MMM")} – ${format(sunday, "EEE d MMM yyyy")}`;
  }
  return `${format(monday, "EEE d MMM")} – ${format(sunday, "EEE d MMM")}`;
}

function weekMeta(date: Date, now = new Date()) {
  const monday = startOfWeek(date, WEEK_STARTS_ON_MONDAY);
  const sunday = endOfWeek(date, WEEK_STARTS_ON_MONDAY);
  const range = formatWeekRange(monday, sunday, now);
  const key = format(monday, "yyyy-MM-dd");

  if (isThisWeek(date, WEEK_STARTS_ON_MONDAY)) {
    return { key, title: "This week", range };
  }
  if (isSameWeek(date, subWeeks(now, 1), WEEK_STARTS_ON_MONDAY)) {
    return { key, title: "Last week", range };
  }
  return { key, title: range, range: "" };
}

export function groupTasksByCompletedWeek<
  T extends { completed_at: string | null; updated_at: string },
>(tasks: T[], now = new Date()): CompletedWeekGroup<T>[] {
  const groups = new Map<string, CompletedWeekGroup<T>>();

  for (const task of tasks) {
    const date = completedDate(task);
    const meta = date
      ? weekMeta(date, now)
      : { key: "unknown", title: "Unknown week", range: "" };
    const existing = groups.get(meta.key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(meta.key, { ...meta, tasks: [task] });
    }
  }

  const sorted = [...groups.values()].sort((a, b) => {
    if (a.key === "unknown") return 1;
    if (b.key === "unknown") return -1;
    return a.key < b.key ? 1 : -1;
  });

  for (const group of sorted) {
    group.tasks.sort((a, b) => {
      const aTime = completedDate(a)?.getTime() ?? 0;
      const bTime = completedDate(b)?.getTime() ?? 0;
      return bTime - aTime;
    });
  }

  return sorted;
}
