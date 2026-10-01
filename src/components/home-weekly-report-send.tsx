"use client";

import { useState, useTransition } from "react";

import { sendStandingProjectReport } from "@/lib/actions/reports";

export function HomeWeeklyReportSend({
  projectId,
  reportId,
  projectName,
}: {
  projectId: string;
  reportId: string;
  projectName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`Send ${projectName} report`}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await sendStandingProjectReport(projectId, reportId);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setMessage(result.message);
          });
        }}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>
      {error ? (
        <p className="max-w-xs text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-[var(--accent)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
