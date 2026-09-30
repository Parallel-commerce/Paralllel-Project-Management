import { addDays, differenceInCalendarDays, differenceInCalendarWeeks, format, startOfDay } from "date-fns";

import type { Weekday } from "@/lib/scheduled-weekdays";
import { normalizeScheduledWeekdays } from "@/lib/scheduled-weekdays";
import type { ScheduleCadence } from "@/types/database";

export type ScheduleConfig = {
  weekdays: number[];
  cadence: ScheduleCadence;
  anchorDate: string;
};

export function hasActiveCadence(cadence: ScheduleCadence): boolean {
  return cadence !== "none";
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Mon–Fri when the project has no scheduled weekdays configured. */
const DEFAULT_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export function resolveScheduleWeekdays(weekdays: number[]): number[] {
  const normalized = normalizeScheduledWeekdays(weekdays);
  return normalized.length > 0 ? normalized : DEFAULT_WEEKDAYS;
}

export function isScheduledWorkDay(
  date: Date,
  config: ScheduleConfig,
): boolean {
  if (config.cadence === "none") {
    return false;
  }

  const day = startOfDay(date);

  if (config.cadence === "every_3_days") {
    const anchor = parseIsoDate(config.anchorDate.slice(0, 10));
    if (!anchor) return true;
    const diff = differenceInCalendarDays(day, startOfDay(anchor));
    // Allow dates on or after the anchor on a 3-day cycle.
    return diff >= 0 && diff % 3 === 0;
  }

  const weekdays = resolveScheduleWeekdays(config.weekdays);
  if (!weekdays.includes(day.getDay() as Weekday)) {
    return false;
  }

  if (config.cadence === "weekly") {
    return true;
  }

  const anchor = parseIsoDate(config.anchorDate.slice(0, 10));
  if (!anchor) return true;

  const weekDiff = differenceInCalendarWeeks(day, startOfDay(anchor), {
    weekStartsOn: 1,
  });
  return weekDiff % 2 === 0;
}

/**
 * Next available scheduled day with fewer than `capacity` open tasks.
 * Defaults to capacity 1 (one task per day).
 */
export function allocateNextAvailableDay(
  config: ScheduleConfig,
  occupancy: Record<string, number>,
  options?: {
    fromDate?: Date | string;
    capacity?: number;
    /** Skip searching more than this many calendar days ahead. */
    maxDays?: number;
  },
): string | null {
  const capacity = options?.capacity ?? 1;
  const maxDays = options?.maxDays ?? 366;
  const rawFrom =
    typeof options?.fromDate === "string"
      ? parseIsoDate(options.fromDate) ?? new Date()
      : (options?.fromDate ?? new Date());
  let cursor = startOfDay(rawFrom);

  for (let i = 0; i < maxDays; i++) {
    if (isScheduledWorkDay(cursor, config)) {
      const iso = toIsoDate(cursor);
      if ((occupancy[iso] ?? 0) < capacity) {
        return iso;
      }
    }
    cursor = addDays(cursor, 1);
  }

  return null;
}

/**
 * Assign one scheduled day per task in order, mutating a copy of occupancy.
 * Returns ISO dates aligned with `count` (null entries if allocation fails).
 */
export function allocateSequentialDueDates(
  config: ScheduleConfig,
  count: number,
  occupancy: Record<string, number> = {},
  options?: {
    fromDate?: Date | string;
    capacity?: number;
  },
): (string | null)[] {
  const nextOccupancy = { ...occupancy };
  const dates: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    const day = allocateNextAvailableDay(config, nextOccupancy, options);
    if (day) {
      nextOccupancy[day] = (nextOccupancy[day] ?? 0) + 1;
    }
    dates.push(day);
  }
  return dates;
}

export function dayIsOccupied(
  isoDate: string,
  occupancy: Record<string, number>,
  capacity = 1,
): boolean {
  return (occupancy[isoDate.slice(0, 10)] ?? 0) >= capacity;
}
