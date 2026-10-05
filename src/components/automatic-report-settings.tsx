"use client";

import { useState, useTransition } from "react";

import { updateAutomaticReports } from "@/lib/actions/reports";

export function AutomaticReportSettings({
  projectId,
  weekly,
  monthly,
}: {
  projectId: string;
  weekly: boolean;
  monthly: boolean;
}) {
  const [weeklyOn, setWeeklyOn] = useState(weekly);
  const [monthlyOn, setMonthlyOn] = useState(monthly);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { weekly: boolean; monthly: boolean }) {
    setWeeklyOn(next.weekly);
    setMonthlyOn(next.monthly);
    setError(null);
    startTransition(async () => {
      const result = await updateAutomaticReports(projectId, next);
      if ("error" in result) {
        setWeeklyOn(weeklyOn);
        setMonthlyOn(monthlyOn);
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Automatic reports</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Prepared reports show on Reports as Ready. Open one to review it, then
        send it.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={weeklyOn}
            disabled={pending}
            onChange={(event) =>
              save({ weekly: event.target.checked, monthly: monthlyOn })
            }
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">Weekly</span>
            <span className="mt-0.5 block text-[var(--muted)]">
              Store report every Monday at 7:00.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={monthlyOn}
            disabled={pending}
            onChange={(event) =>
              save({ weekly: weeklyOn, monthly: event.target.checked })
            }
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">Monthly</span>
            <span className="mt-0.5 block text-[var(--muted)]">
              Store report and performance letter on the 1st at 7:00 GMT.
            </span>
          </span>
        </label>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
