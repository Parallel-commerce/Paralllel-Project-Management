"use client";

import { useState } from "react";

import type { ScorecardTrend } from "@/types/database";

const PAGE_SIZE = 7;

export type DailySnapshotRow = {
  id: string;
  day: string;
  orders: string;
  sales: string;
  sessions: string;
  conversion: string;
  change: string | null;
  trend: ScorecardTrend | undefined;
};

export function DailySnapshotPages({ rows }: { rows: DailySnapshotRow[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="mt-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-1.5 pr-3 font-medium">Day</th>
              <th className="py-1.5 pr-3 font-medium">Orders</th>
              <th className="py-1.5 pr-3 font-medium">Sales</th>
              <th className="py-1.5 pr-3 font-medium">Sessions</th>
              <th className="py-1.5 pr-3 font-medium">Conversion</th>
              <th className="py-1.5 font-medium">vs previous</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="py-1.5 pr-3">{row.day}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.orders}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.sales}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.sessions}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.conversion}</td>
                <td
                  className={`py-1.5 tabular-nums ${
                    row.trend === "up"
                      ? "text-[var(--status-done-label)]"
                      : row.trend === "down"
                        ? "text-[var(--danger)]"
                        : "text-[var(--muted)]"
                  }`}
                >
                  {row.change ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            className="text-sm text-[var(--accent)] hover:underline disabled:text-[var(--muted)] disabled:no-underline"
          >
            Newer
          </button>
          <p className="text-xs text-[var(--muted)]">
            {start + 1}–{start + visible.length} of {rows.length}
          </p>
          <button
            type="button"
            disabled={current >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            className="text-sm text-[var(--accent)] hover:underline disabled:text-[var(--muted)] disabled:no-underline"
          >
            Older
          </button>
        </div>
      ) : null}
    </div>
  );
}
