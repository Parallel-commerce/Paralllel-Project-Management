"use client";

import { useState, useTransition } from "react";

import { CompanyVerticalField } from "@/components/company-vertical-field";
import { createCompany } from "@/lib/actions/crm";
import { verticalNamesEqual, type VerticalOption } from "@/lib/verticals";
import {
  COMPANY_KINDS,
  OPEN_LEAD_STATUSES,
  type CompanyKind,
} from "@/types/database";

export function CreateCompanyForm({
  verticals = [],
  defaultKind = "prospect",
  lockKind = false,
}: {
  verticals?: VerticalOption[];
  defaultKind?: CompanyKind;
  /** Hide the type select and always create as defaultKind. */
  lockKind?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<CompanyKind>(defaultKind);
  const [selectedVerticals, setSelectedVerticals] = useState<VerticalOption[]>(
    [],
  );
  const showStatus = kind === "prospect";

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        if (lockKind) {
          formData.set("kind", defaultKind);
        }
        if (kind !== "prospect") {
          formData.delete("status");
        }
        setError(null);
        startTransition(async () => {
          const result = await createCompany(formData);
          if (result?.error) setError(result.error);
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Company name
        <input
          name="name"
          required
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Website
        <input
          name="website"
          placeholder="https://"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
      </label>
      {lockKind ? (
        <input type="hidden" name="kind" value={defaultKind} />
      ) : (
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Type
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as CompanyKind)}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          >
            {COMPANY_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {showStatus ? (
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Lead status
          <select
            name="status"
            defaultValue="lead"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          >
            {OPEN_LEAD_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <CompanyVerticalField
        name="vertical"
        selected={selectedVerticals}
        options={verticals}
        disabled={pending}
        onAdd={(input) => {
          setSelectedVerticals((current) => {
            if (current.some((item) => verticalNamesEqual(item.name, input.name))) {
              return current;
            }
            return [
              ...current,
              {
                id: input.id ?? `new:${input.name.toLowerCase()}`,
                name: input.name,
              },
            ];
          });
        }}
        onRemove={(verticalId) => {
          setSelectedVerticals((current) =>
            current.filter((item) => item.id !== verticalId),
          );
        }}
      />
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
        {pending ? "Creating…" : showStatus ? "Add prospect" : "Add company"}
      </button>
    </form>
  );
}
