"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCompany } from "@/lib/actions/crm";

export function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete company ${companyName}`}
        onClick={() => {
          if (
            !window.confirm(
              `Delete ${companyName} and its contacts? Linked projects stay, but the CRM record is gone.`,
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await deleteCompany(companyId, { redirect: false });
            if (result?.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="whitespace-nowrap rounded-md px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-red-50 hover:text-[var(--danger)] disabled:opacity-60 sm:px-2.5 sm:text-sm"
      >
        {pending ? "Deleting…" : "Delete company"}
      </button>
      {error ? (
        <p className="mt-1 max-w-[10rem] text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
