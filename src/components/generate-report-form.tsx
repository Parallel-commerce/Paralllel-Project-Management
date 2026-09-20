"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { ReportRangePicker, type ReportRangeValue } from "@/components/report-range-picker";
import {
  generateProjectReport,
  generateStoreReport,
} from "@/lib/actions/reports";

export function GenerateReportForm({
  projectId,
  storeConnected,
  missingReportsScope,
}: {
  projectId: string;
  storeConnected: boolean;
  missingReportsScope: boolean;
}) {
  const [range, setRange] = useState<ReportRangeValue>({
    preset: "last_week",
    start: "",
    end: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"progress" | "store" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const customIncomplete =
    range.preset === "custom" && (!range.start || !range.end);
  const busy = pending || pendingKind !== null;

  function run(kind: "progress" | "store") {
    setError(null);
    setPendingKind(kind);
    startTransition(async () => {
      try {
        const result =
          kind === "store"
            ? await generateStoreReport(projectId, range)
            : await generateProjectReport(projectId, range);
        if (result && "error" in result) {
          setError(result.error);
        }
      } finally {
        setPendingKind(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h2 className="font-medium">Generate report</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose a date range, then generate a performance report from project
          activity or a store report from Shopify.
        </p>
      </div>

      <ReportRangePicker value={range} onChange={setRange} />

      {missingReportsScope ? (
        <p className="text-sm text-[var(--muted)]">
          Store reports can run without <code>read_reports</code>, but sessions
          and conversion need that scope. Add it on the custom app and{" "}
          <Link
            href={`/projects/${projectId}/settings`}
            className="text-[var(--accent)] hover:underline"
          >
            reconnect
          </Link>
          .
        </p>
      ) : null}

      {!storeConnected ? (
        <p className="text-sm text-[var(--muted)]">
          Connect Shopify in{" "}
          <Link
            href={`/projects/${projectId}/settings`}
            className="text-[var(--accent)] hover:underline"
          >
            Settings
          </Link>{" "}
          to generate store reports.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy || customIncomplete}
          onClick={() => run("progress")}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pendingKind === "progress"
            ? "Generating…"
            : "Generate performance report"}
        </button>
        <button
          type="button"
          disabled={busy || customIncomplete || !storeConnected}
          onClick={() => run("store")}
          className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {pendingKind === "store" ? "Generating…" : "Generate store report"}
        </button>
      </div>
    </div>
  );
}
