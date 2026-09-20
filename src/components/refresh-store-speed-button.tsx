"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { syncStoreSpeed } from "@/lib/actions/store";

export function RefreshStoreSpeedButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await syncStoreSpeed(projectId);
            if (result && "error" in result) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        {pending ? "Measuring…" : "Refresh speed"}
      </button>
      {error ? (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
