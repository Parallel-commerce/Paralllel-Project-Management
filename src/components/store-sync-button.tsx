"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { syncShopifySnapshot } from "@/lib/actions/store";

export function StoreSyncButton({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending || !enabled}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await syncShopifySnapshot(projectId);
            if (result && "error" in result) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
