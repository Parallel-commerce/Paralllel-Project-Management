"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enrichCompany } from "@/lib/actions/crm";
import { formatDateTime } from "@/lib/format-date";

export function CompanyEnrichButton({
  companyId,
  enrichedAt,
}: {
  companyId: string;
  enrichedAt: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        title={
          enrichedAt
            ? `Last looked up ${formatDateTime(enrichedAt)}`
            : "Adds a summary and LinkedIn links"
        }
        onClick={() => {
          setError(null);
          setStatus(null);
          startTransition(async () => {
            const result = await enrichCompany(companyId);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            const parts = ["Summary updated"];
            if (result.companyLinkedIn) parts.push("company LinkedIn found");
            if (result.contactsLinkedIn > 0) {
              parts.push(
                `${result.contactsLinkedIn} contact LinkedIn${
                  result.contactsLinkedIn === 1 ? "" : "s"
                }`,
              );
            }
            setStatus(parts.join(". ") + ".");
            router.refresh();
          });
        }}
        className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        {pending
          ? "Looking up…"
          : enrichedAt
            ? "Refresh lookup"
            : "Look up"}
      </button>
      {error || status || pending ? (
        <p
          className={`max-w-[14rem] text-right text-[11px] leading-snug ${
            error ? "text-[var(--danger)]" : "text-[var(--muted)]"
          }`}
          aria-live="polite"
        >
          {pending
            ? "Searching…"
            : error
              ? error
              : status}
        </p>
      ) : null}
    </div>
  );
}
