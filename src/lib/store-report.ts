import type {
  PeriodMetric,
  ReportPeriod,
  ScorecardMetric,
  ScorecardTrend,
  StoreReportDigest,
} from "@/types/database";

const TREND_BAND = 2;

export function isStoreReportDigest(
  digest: unknown,
): digest is StoreReportDigest {
  return (
    typeof digest === "object" &&
    digest !== null &&
    "kind" in digest &&
    (digest as { kind?: unknown }).kind === "store"
  );
}

export function asStoreReportDigest(
  digest: unknown,
  kind?: string | null,
): StoreReportDigest | null {
  if (isStoreReportDigest(digest)) return digest;
  if (kind === "store" && digest && typeof digest === "object") {
    return digest as StoreReportDigest;
  }
  return null;
}

export function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function changePct(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

export function periodMetric(
  thisWeek: number | null | undefined,
  lastWeek: number | null | undefined,
): PeriodMetric {
  const current = thisWeek ?? null;
  const previous = lastWeek ?? null;
  return {
    this_week: current,
    last_week: previous,
    change_pct: changePct(current, previous),
  };
}

export function trendFromChange(change: number | null): ScorecardTrend | null {
  if (change == null) return null;
  if (Math.abs(change) <= TREND_BAND) return "flat";
  return change > 0 ? "up" : "down";
}

export function trendDot(trend: ScorecardTrend | null) {
  if (trend === "up") return "🟢";
  if (trend === "down") return "🔴";
  if (trend === "flat") return "⚪";
  return "—";
}

function scoreInterpretation(
  score: number,
  greens: number,
  noun: "week" | "month" | "period" = "week",
) {
  if (score >= 80) {
    return `Strong ${noun}: most metrics trending positively (${greens} of 6 improved).`;
  }
  if (score >= 50) {
    return `Mixed performance: some wins, some areas need attention (${greens} of 6 improved).`;
  }
  if (score >= 25) {
    return `Challenging ${noun}: more declines than improvements (${greens} of 6 improved).`;
  }
  return `Difficult ${noun}: most metrics declined (${greens} of 6 improved).`;
}

export function buildScorecard(input: {
  totalSales: PeriodMetric;
  orders: PeriodMetric;
  conversionRate: PeriodMetric | null;
  aov: PeriodMetric;
  returningRate: PeriodMetric | null;
  sessions: PeriodMetric | null;
  periodNoun?: "week" | "month" | "period";
}): StoreReportDigest["scorecard"] {
  const metrics: ScorecardMetric[] = [
    {
      key: "total_sales",
      label: "Total Sales",
      format: "money",
      this_week: input.totalSales.this_week,
      last_week: input.totalSales.last_week,
      change_pct: input.totalSales.change_pct,
      trend: trendFromChange(input.totalSales.change_pct),
      available: input.totalSales.this_week != null,
    },
    {
      key: "orders",
      label: "Orders",
      format: "count",
      this_week: input.orders.this_week,
      last_week: input.orders.last_week,
      change_pct: input.orders.change_pct,
      trend: trendFromChange(input.orders.change_pct),
      available: input.orders.this_week != null,
    },
    {
      key: "conversion_rate",
      label: "Conversion Rate",
      format: "percent",
      this_week: input.conversionRate?.this_week ?? null,
      last_week: input.conversionRate?.last_week ?? null,
      change_pct: input.conversionRate?.change_pct ?? null,
      trend: trendFromChange(input.conversionRate?.change_pct ?? null),
      available: input.conversionRate?.this_week != null,
    },
    {
      key: "aov",
      label: "Average Order Value",
      format: "money",
      this_week: input.aov.this_week,
      last_week: input.aov.last_week,
      change_pct: input.aov.change_pct,
      trend: trendFromChange(input.aov.change_pct),
      available: input.aov.this_week != null,
    },
    {
      key: "returning_rate",
      label: "Returning Customer Rate",
      format: "percent",
      this_week: input.returningRate?.this_week ?? null,
      last_week: input.returningRate?.last_week ?? null,
      change_pct: input.returningRate?.change_pct ?? null,
      trend: trendFromChange(input.returningRate?.change_pct ?? null),
      available: input.returningRate?.this_week != null,
    },
    {
      key: "sessions",
      label: "Sessions",
      format: "count",
      this_week: input.sessions?.this_week ?? null,
      last_week: input.sessions?.last_week ?? null,
      change_pct: input.sessions?.change_pct ?? null,
      trend: trendFromChange(input.sessions?.change_pct ?? null),
      available: input.sessions?.this_week != null,
    },
  ];

  const greens = metrics.filter((metric) => metric.trend === "up").length;
  const score = Math.round((greens / 6) * 100);

  return {
    metrics,
    greens,
    scored: 6,
    score,
    interpretation: scoreInterpretation(score, greens, input.periodNoun ?? "week"),
  };
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type ZoneYmd = { year: number; month: number; day: number };

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function ymdKey(parts: ZoneYmd) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function addDays(parts: ZoneYmd, days: number): ZoneYmd {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  const date = new Date(utc);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: map.weekday ?? "Mon",
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(
  parts: ZoneYmd,
  timeZone: string,
  hms: { hour: number; minute: number; second: number; ms?: number },
) {
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hms.hour,
    hms.minute,
    hms.second,
    hms.ms ?? 0,
  );
  const offset1 = timeZoneOffsetMs(new Date(guess), timeZone);
  const utc = guess - offset1;
  const offset2 = timeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(guess - offset2);
}

export type StoreMetricWindow = {
  weekStart: string;
  weekEnd: string;
  previousWeekStart: string;
  previousWeekEnd: string;
  weekStartUtc: Date;
  weekEndUtc: Date;
  previousWeekStartUtc: Date;
  previousWeekEndUtc: Date;
};

function metricWindow(
  start: ZoneYmd,
  end: ZoneYmd,
  previousStart: ZoneYmd,
  previousEnd: ZoneYmd,
  timeZone: string,
): StoreMetricWindow {
  return {
    weekStart: ymdKey(start),
    weekEnd: ymdKey(end),
    previousWeekStart: ymdKey(previousStart),
    previousWeekEnd: ymdKey(previousEnd),
    weekStartUtc: zonedTimeToUtc(start, timeZone, {
      hour: 0,
      minute: 0,
      second: 0,
    }),
    weekEndUtc: zonedTimeToUtc(end, timeZone, {
      hour: 23,
      minute: 59,
      second: 59,
      ms: 999,
    }),
    previousWeekStartUtc: zonedTimeToUtc(previousStart, timeZone, {
      hour: 0,
      minute: 0,
      second: 0,
    }),
    previousWeekEndUtc: zonedTimeToUtc(previousEnd, timeZone, {
      hour: 23,
      minute: 59,
      second: 59,
      ms: 999,
    }),
  };
}

export function lastCompleteLocalDay(now: Date, timeZone: string) {
  const today = zonedParts(now, timeZone);
  const yesterday = addDays(today, -1);
  return {
    ymd: ymdKey(yesterday),
    startUtc: zonedTimeToUtc(yesterday, timeZone, {
      hour: 0,
      minute: 0,
      second: 0,
    }),
    endUtc: zonedTimeToUtc(yesterday, timeZone, {
      hour: 23,
      minute: 59,
      second: 59,
      ms: 999,
    }),
  };
}

export function lastCompleteWeek(now: Date, timeZone: string) {
  const today = zonedParts(now, timeZone);
  const weekday = WEEKDAY_INDEX[today.weekday] ?? 1;
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const thisMonday = addDays(today, -daysSinceMonday);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);
  const prevMonday = addDays(lastMonday, -7);
  const prevSunday = addDays(lastMonday, -1);
  return metricWindow(lastMonday, lastSunday, prevMonday, prevSunday, timeZone);
}

export function lastCompleteMonth(now: Date, timeZone: string) {
  const today = zonedParts(now, timeZone);
  const thisMonthStart: ZoneYmd = {
    year: today.year,
    month: today.month,
    day: 1,
  };
  const lastMonthEnd = addDays(thisMonthStart, -1);
  const lastMonthStart: ZoneYmd = {
    year: lastMonthEnd.year,
    month: lastMonthEnd.month,
    day: 1,
  };
  const prevMonthEnd = addDays(lastMonthStart, -1);
  const prevMonthStart: ZoneYmd = {
    year: prevMonthEnd.year,
    month: prevMonthEnd.month,
    day: 1,
  };
  return metricWindow(
    lastMonthStart,
    lastMonthEnd,
    prevMonthStart,
    prevMonthEnd,
    timeZone,
  );
}

export function storeWindowFromYmdRange(
  startYmd: string,
  endYmd: string,
  timeZone: string,
): StoreMetricWindow | { error: string } {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  const startIndex = utcDayNumber(start);
  const endIndex = utcDayNumber(end);
  if (startIndex > endIndex) {
    return { error: "The start date must be on or before the end date." };
  }
  if (endIndex - startIndex + 1 > 366) {
    return { error: "Choose a range of 366 days or fewer." };
  }
  const length = endIndex - startIndex;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -length);
  return metricWindow(start, end, previousStart, previousEnd, timeZone);
}

export function resolveStoreMetricWindow(
  range: { preset: "last_week" | "last_month" | "custom"; start?: string | null; end?: string | null },
  timeZone: string,
  now = new Date(),
): StoreMetricWindow | { error: string } {
  if (range.preset === "last_week") return lastCompleteWeek(now, timeZone);
  if (range.preset === "last_month") return lastCompleteMonth(now, timeZone);
  if (!range.start || !range.end) {
    return { error: "Choose a start and end date." };
  }
  return storeWindowFromYmdRange(range.start, range.end, timeZone);
}

function utcDayNumber(parts: ZoneYmd) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

export function shiftWeek(start: string, end: string, days: number) {
  const startYmd = parseYmd(start);
  const endYmd = parseYmd(end);
  return {
    start: ymdKey(addDays(startYmd, days)),
    end: ymdKey(addDays(endYmd, days)),
  };
}

function parseYmd(value: string): ZoneYmd {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

export function storeReportTitle(
  period: ReportPeriod | undefined,
  start: string,
  end: string,
) {
  const range = formatStoreRange(start, end);
  if (period === "month") return `Monthly store report · ${range}`;
  if (period === "custom") return `Store report · ${range}`;
  return `Weekly store report · ${range}`;
}

export function formatStoreRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameMonth =
    startDate.getUTCMonth() === endDate.getUTCMonth() &&
    startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const startLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
    timeZone: "UTC",
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(endDate);
  return `${startLabel}–${endLabel}`;
}

export function formatStoreMoney(
  amount: number | null | undefined,
  currency: string | null,
) {
  if (amount == null) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function formatStoreNumber(value: number | null | undefined) {
  if (value == null) return "Unavailable";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatStorePercent(value: number | null | undefined) {
  if (value == null) return "Unavailable";
  return `${formatStoreNumber(value)}%`;
}

export function formatChangePct(value: number | null | undefined) {
  if (value == null) return "Unavailable";
  const rounded = round1(value);
  if (rounded === 0) return "0%";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatStoreNumber(Math.abs(rounded))}%`;
}

export function weekdayLabel(isoDate: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
  } catch {
    return isoDate;
  }
}
