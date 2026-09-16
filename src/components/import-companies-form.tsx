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
            result.companiesUpdated
              ? `${result.companiesUpdated} compan${result.companiesUpdated === 1 ? "y" : "ies"} updated`
              : null,
            result.verticalsAssigned
              ? `verticals set on ${result.verticalsAssigned}`
              : null,
            result.companiesMatched
              ? `${result.companiesMatched} matched existing`
              : null,
            result.contactsCreated
              ? `${result.contactsCreated} contact${result.contactsCreated === 1 ? "" : "s"} added`
              : null,
            result.contactsUpdated
              ? `${result.contactsUpdated} contact${result.contactsUpdated === 1 ? "" : "s"} updated`
              : null,
            result.contactsSkipped
              ? `${result.contactsSkipped} contact${result.contactsSkipped === 1 ? "" : "s"} skipped`
              : null,
          ].filter(Boolean);
          const extraErrorCount = Math.max(0, result.errors.length - 8);
          const rowErrors =
            result.errors.length > 0
              ? `${result.errors
                  .slice(0, 8)
                  .map((item) => `Row ${item.row}: ${item.message}`)
                  .join(" ")}${
                  extraErrorCount
                    ? ` And ${extraErrorCount} more row issue${extraErrorCount === 1 ? "" : "s"}.`
                    : ""
                }`
              : "";
          setSummary(
            parts.length > 0
              ? `${parts.join(". ")}${result.warning ? `. ${result.warning}` : ""}${rowErrors ? `. ${rowErrors}` : ""}`
              : result.warning || rowErrors || "Nothing to import.",
          );
          form.reset();
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-[var(--muted)]">
        Download every company and contact, edit the spreadsheet, then import
        the same file. Keep the company_id and contact_id columns so existing
        records update. Leave those ids blank to add new rows. Separate
        verticals with commas, such as Fashion, Beauty. Follow-up dates must
        stay YYYY-MM-DD.
      </p>
      <div className="flex flex-col gap-1">
        <a
          href="/crm/export"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Download all companies
        </a>
        <a
          href={templateHref()}
          download="parallel-crm-import.csv"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Download empty template
        </a>
      </div>
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
