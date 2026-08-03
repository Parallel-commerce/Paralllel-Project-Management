"use client";

import { useState, useTransition } from "react";

import { generateProjectReport } from "@/lib/actions/reports";
import type { ReportPreset } from "@/lib/reports";

const PRESETS: { value: ReportPreset; label: string; hint: string }[] = [
  { value: "this_week", label: "This week", hint: "Monday to now" },
  { value: "last_week", label: "Last week", hint: "Previous full week" },
  { value: "this_month", label: "This month", hint: "1st to now" },
  { value: "last_month", label: "Last month", hint: "Previous calendar month" },
];

export function GenerateReportForm({ projectId }: { projectId: string }) {
  const [preset, setPreset] = useState<ReportPreset>("this_week");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await generateProjectReport(projectId, preset);
          if (result && "error" in result) {
            setError(result.error);
          }
        });
      }}
    >
      <div>
        <h2 className="font-medium">Generate report</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Builds a digest from project activity, drafts a Claude narrative, then
          lets you preview and email clients.
        </p>
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        {PRESETS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
              preset === option.value
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--border)] bg-white"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name="preset"
                value={option.value}
                checked={preset === option.value}
                onChange={() => setPreset(option.value)}
              />
              {option.label}
            </span>
            <span className="mt-1 pl-5 text-xs text-[var(--muted)]">
              {option.hint}
            </span>
          </label>
        ))}
      </fieldset>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate report"}
      </button>
    </form>
  );
}
