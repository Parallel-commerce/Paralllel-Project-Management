"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { importCompanies } from "@/lib/actions/crm";
import { COMPANY_IMPORT_TEMPLATE } from "@/lib/crm-csv";

function templateHref() {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(COMPANY_IMPORT_TEMPLATE)}`;
}

export function ImportCompaniesForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setError(null);
        setSummary(null);
        startTransition(async () => {
          const result = await importCompanies(formData);
          if (result.error) {
            setError(result.error);
            return;
          }
          const parts = [
            result.companiesCreated
              ? `${result.companiesCreated} compan${result.companiesCreated === 1 ? "y" : "ies"} added`
              : null,
            result.companiesMatched
              ? `${result.companiesMatched} matched existing`
              : null,
            result.contactsCreated
              ? `${result.contactsCreated} contact${result.contactsCreated === 1 ? "" : "s"} added`
              : null,
            result.contactsSkipped
              ? `${result.contactsSkipped} contact${result.contactsSkipped === 1 ? "" : "s"} skipped`
              : null,
          ].filter(Boolean);
          const rowErrors =
            result.errors.length > 0
              ? result.errors
                  .slice(0, 5)
                  .map((item) => `Row ${item.row}: ${item.message}`)
                  .join(" ")
              : "";
          setSummary(
            parts.length > 0
              ? `${parts.join(". ")}${rowErrors ? `. ${rowErrors}` : ""}`
              : rowErrors || "Nothing new to import.",
          );
          form.reset();
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-[var(--muted)]">
        One row per contact. Repeat the company name for extra people. Existing
        companies are matched by name.
      </p>
      <a
        href={templateHref()}
        download="parallel-crm-import.csv"
        className="text-sm text-[var(--accent)] hover:underline"
      >
        Download CSV template
      </a>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        CSV file
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-xs"
        />
      </label>
      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {summary ? (
        <p className="text-sm text-[var(--status-done-label)]">{summary}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        {pending ? "Importing…" : "Import CSV"}
      </button>
    </form>
  );
}
