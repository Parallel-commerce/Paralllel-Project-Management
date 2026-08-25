"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCompany, updateCompany } from "@/lib/actions/crm";
import { dateInputValue } from "@/lib/format-date";
import { COMPANY_STATUSES, type Company } from "@/types/database";

export function CompanyEditor({ company }: { company: Company }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="font-medium">Company</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Status, notes, and a follow-up date if this prospect needs another pass.
      </p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          setSaved(false);
          startTransition(async () => {
            const result = await updateCompany(company.id, formData);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setSaved(true);
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Name
          <input
            name="name"
            required
            defaultValue={company.name}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Website
          <input
            name="website"
            defaultValue={company.website ?? ""}
            placeholder="https://"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Status
            <select
              name="status"
              defaultValue={company.status}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            >
              {COMPANY_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Follow up on
            <input
              type="date"
              name="follow_up_at"
              defaultValue={dateInputValue(company.follow_up_at)}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Follow-up note
          <input
            name="follow_up_note"
            defaultValue={company.follow_up_note ?? ""}
            placeholder="Why to follow up, or who to call"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Notes
          <textarea
            name="notes"
            rows={4}
            defaultValue={company.notes ?? ""}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-sm text-[var(--status-done-label)]">Saved.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save company"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this company and its contacts? Linked projects stay, but the CRM record is gone.",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const result = await deleteCompany(company.id);
                if (result?.error) setError(result.error);
              });
            }}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </form>
    </section>
  );
}
