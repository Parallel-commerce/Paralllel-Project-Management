/** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: { value: Weekday; label: string; long: string }[] = [
  { value: 1, label: "Mon", long: "Monday" },
  { value: 2, label: "Tue", long: "Tuesday" },
  { value: 3, label: "Wed", long: "Wednesday" },
  { value: 4, label: "Thu", long: "Thursday" },
  { value: 5, label: "Fri", long: "Friday" },
  { value: 6, label: "Sat", long: "Saturday" },
  { value: 0, label: "Sun", long: "Sunday" },
];

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

export function normalizeScheduledWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = new Set<Weekday>();
  for (const item of value) {
    const n = typeof item === "string" ? Number(item) : item;
    if (typeof n === "number" && isWeekday(n)) {
      days.add(n);
    }
  }
  return WEEKDAYS.filter((day) => days.has(day.value)).map((day) => day.value);
}

export function parseScheduledWeekdays(formData: FormData): number[] {
  return normalizeScheduledWeekdays(formData.getAll("scheduled_weekdays"));
}

export function scheduledWeekdaysFromProject(project: unknown): number[] {
  const row = Array.isArray(project) ? project[0] : project;
  if (!row || typeof row !== "object") return [];
  return normalizeScheduledWeekdays(
    (row as { scheduled_weekdays?: unknown }).scheduled_weekdays,
  );
}

export function formatScheduledWeekdays(days: number[]): string | null {
  const labels = WEEKDAYS.filter((day) => days.includes(day.value)).map(
    (day) => `${day.long}s`,
  );
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
