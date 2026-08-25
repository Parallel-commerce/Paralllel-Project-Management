"use client";

import { useState, useTransition } from "react";

import { convertCompanyToProject } from "@/lib/actions/crm";
import type { Contact } from "@/types/database";

export function ConvertCompanyForm({
  companyId,
  companyName,
  contacts,
}: {
  companyId: string;
  companyName: string;
  contacts: Contact[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invitable = contacts.filter((contact) => contact.email);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="font-medium">Create project</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        When the sale is won, create a project for this company and optionally
        invite contacts as clients.
      </p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await convertCompanyToProject(companyId, formData);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Project name
          <input
            name="name"
            required
            defaultValue={companyName}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Description
          <textarea
            name="description"
            rows={2}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>

        {invitable.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-[var(--muted)]">
              Invite as clients
            </legend>
            {invitable.map((contact) => (
              <label
                key={contact.id}
                className="flex items-start gap-2 text-sm text-[var(--foreground)]"
              >
                <input
                  type="checkbox"
                  name="invite_contact_ids"
                  value={contact.id}
                  defaultChecked={contact.is_primary}
                  className="mt-0.5"
                />
                <span>
                  {contact.full_name}
                  <span className="block text-[var(--muted)]">
                    {contact.email}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Add a contact with an email to invite them as a client on the new
            project.
          </p>
        )}

        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create project"}
        </button>
      </form>
    </section>
  );
}
