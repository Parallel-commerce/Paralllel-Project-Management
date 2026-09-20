import {
  changePct,
  formatStoreNumber,
  round1,
  trendFromChange,
} from "@/lib/store-report";
import type { ProjectStoreSnapshot, ScorecardTrend } from "@/types/database";

export const STORE_SNAPSHOT_FETCH_LIMIT = 60;
export const STORE_DAILY_HISTORY_LIMIT = 30;

export type SnapshotMetricKey = "orders_1d" | "sales_1d";

export function snapshotNumber(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function snapshotChangePct(
  current: ProjectStoreSnapshot,
  previous: ProjectStoreSnapshot | null | undefined,
  key: SnapshotMetricKey,
): number | null {
  if (!previous) return null;
  return changePct(snapshotNumber(current[key]), snapshotNumber(previous[key]));
}

export function vsPreviousDayCopy(change: number | null): {
  label: string;
  trend: ScorecardTrend;
} | null {
  if (change == null) return null;
  const trend = trendFromChange(change) ?? "flat";
  const abs = formatStoreNumber(Math.abs(round1(change)));
  if (trend === "up") return { label: `Up ${abs}% vs previous day`, trend };
  if (trend === "down") return { label: `Down ${abs}% vs previous day`, trend };
  return { label: "Flat vs previous day", trend: "flat" };
}

export function uniqueDailySnapshots(rows: ProjectStoreSnapshot[]) {
  const byDate = new Map<string, ProjectStoreSnapshot>();
  for (const row of rows) {
    if (!row.snapshot_date) continue;
    const existing = byDate.get(row.snapshot_date);
    if (!existing) {
      byDate.set(row.snapshot_date, row);
      continue;
    }
    if (row.source === "scheduled" && existing.source !== "scheduled") {
      byDate.set(row.snapshot_date, row);
    }
  }
  return [...byDate.values()]
    .sort((a, b) => (b.snapshot_date ?? "").localeCompare(a.snapshot_date ?? ""))
    .slice(0, STORE_DAILY_HISTORY_LIMIT);
}
