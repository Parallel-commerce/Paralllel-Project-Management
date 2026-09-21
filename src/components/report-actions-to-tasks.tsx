"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createReportActionTasks } from "@/lib/actions/reports";
import type { ReportAction } from "@/lib/report-actions";

export type ReportActionList = {
  id: string;
  name: string;
};

export type ReportActionTask = {
  key: string;
  taskId: string;
  taskKey: string;
  listId: string;
};

export function ReportActionsToTasks({
  projectId,
  reportId,
  actions,
  lists,
  existingTasks,
}: {
  projectId: string;
  reportId: string;
  actions: ReportAction[];
  lists: ReportActionList[];
  existingTasks: ReportActionTask[];
}) {
  const router = useRouter();
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const existingByKey = useMemo(() => {
    const map = new Map<string, ReportActionTask>();
    for (const task of existingTasks) {
      map.set(task.key, task);
    }
    return map;
  }, [existingTasks]);

  const remaining = actions.filter((action) => !existingByKey.has(action.key));

  function createKeys(keys: string[], pendingId: string) {
    if (!listId) {
      setError("Choose a list first.");
      return;
    }
    setError(null);
    setPendingKey(pendingId);
    startTransition(async () => {
      const result = await createReportActionTasks(
        projectId,
        reportId,
        listId,
        keys,
      );
      setPendingKey(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (actions.length === 0) return null;

  return (
    <section className="rounded-xl bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-medium">Turn into tasks</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Each Insight, next-week action, and site-performance item can
            become its own Improvement task on the list you pick.
          </p>
        </div>
        {lists.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              List
              <select
                value={listId}
                onChange={(event) => setListId(event.target.value)}
                className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
            {remaining.length > 1 ? (
              <button
                type="button"
                disabled={pending || !listId}
                onClick={() =>
                  createKeys(
                    remaining.map((action) => action.key),
                    "all",
                  )
                }
                className="self-end rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {pending && pendingKey === "all"
                  ? "Creating…"
                  : `Create ${remaining.length} remaining`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            <Link
              href={`/projects/${projectId}`}
              className="text-[var(--accent)] hover:underline"
            >
              Create a list
            </Link>{" "}
            first, then come back to turn these into tasks.
          </p>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      <ul className="mt-4 divide-y divide-[var(--border)]">
        {actions.map((action) => {
          const existing = existingByKey.get(action.key);
          return (
            <li key={action.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {action.theme}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                  {action.body}
                </p>
              </div>
              {existing ? (
                <Link
                  href={`/projects/${projectId}/lists/${existing.listId}?task=${existing.taskId}`}
                  className="shrink-0 self-start rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium tabular-nums hover:bg-[var(--surface-2)]"
                >
                  {existing.taskKey}
                </Link>
              ) : lists.length > 0 ? (
                <button
                  type="button"
                  disabled={pending || !listId}
                  onClick={() => createKeys([action.key], action.key)}
                  className="shrink-0 self-start rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
                >
                  {pending && pendingKey === action.key
                    ? "Creating…"
                    : "Create task"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
