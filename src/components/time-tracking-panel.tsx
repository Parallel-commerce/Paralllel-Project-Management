"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  addManualTimeEntry,
  deleteTimeEntry,
  listTaskTimeEntries,
  startTimer,
  stopTimer,
} from "@/lib/actions/time";
import { formatDate } from "@/lib/format-date";
import { parseDurationToSeconds } from "@/lib/parse-duration";
import { personDisplayName } from "@/lib/person";
import type { TimeEntry } from "@/types/database";

export type TimeEntryRow = TimeEntry & {
  profiles?:
    | { full_name: string | null; email: string; deleted_at?: string | null }
    | { full_name: string | null; email: string; deleted_at?: string | null }[]
    | null;
};

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  if (m > 0) {
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${s}s`;
}

export function formatTaskTime(totalSeconds: number) {
  return formatDuration(totalSeconds);
}

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}

function personLabel(entry: TimeEntryRow) {
  const profile = Array.isArray(entry.profiles)
    ? entry.profiles[0]
    : entry.profiles;
  return personDisplayName(profile, "Teammate");
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

async function refreshEntries(
  projectId: string,
  listId: string,
  taskId: string,
  setEntries: (entries: TimeEntryRow[]) => void,
  setError: (error: string | null) => void,
) {
  const refreshed = await listTaskTimeEntries(projectId, listId, taskId);
  if (refreshed.error) {
    setError(refreshed.error);
    return;
  }
  setEntries(refreshed.entries as TimeEntryRow[]);
}

export function TimeTrackingPanel({
  projectId,
  listId,
  taskId,
  currentUserId,
  isAdmin,
  runningEntry,
}: {
  projectId: string;
  listId: string;
  taskId: string;
  currentUserId: string;
  isAdmin: boolean;
  entries?: TimeEntryRow[];
  runningEntry: TimeEntryRow | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [activeRunning, setActiveRunning] = useState<TimeEntryRow | null>(
    runningEntry,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const durationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveRunning(runningEntry);
  }, [runningEntry]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTaskTimeEntries(projectId, listId, taskId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setEntries(result.entries as TimeEntryRow[]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, listId, taskId]);

  const runningOnThisTask =
    !!activeRunning &&
    activeRunning.task_id === taskId &&
    activeRunning.user_id === currentUserId;

  const runningElsewhere =
    !!activeRunning &&
    activeRunning.user_id === currentUserId &&
    activeRunning.task_id !== taskId;

  useEffect(() => {
    if (!runningOnThisTask) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningOnThisTask]);

  const liveSeconds = useMemo(() => {
    if (!runningOnThisTask || !activeRunning) return 0;
    return Math.max(
      0,
      Math.floor(
        (now - new Date(activeRunning.started_at).getTime()) / 1000,
      ),
    );
  }, [activeRunning, runningOnThisTask, now]);

  const totalSeconds = useMemo(() => {
    const completed = entries.reduce(
      (sum, entry) => sum + (entry.duration_seconds ?? 0),
      0,
    );
    return completed + liveSeconds;
  }, [entries, liveSeconds]);

  const fieldClassName =
    "min-h-9 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[var(--foreground)] outline-none ring-[var(--accent)] placeholder:text-[var(--muted)] focus:ring-2";

  return (
    <section className="mt-5 border-t border-[var(--border)] pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">
          Time
          <span className="ml-1.5 font-normal text-[var(--muted)]">
            · internal
          </span>
        </h3>
        <p className="shrink-0 text-sm font-medium tabular-nums">
          {loading ? "…" : formatDuration(totalSeconds)}
        </p>
      </div>

      {runningOnThisTask && activeRunning ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-display text-xl tabular-nums tracking-tight">
            {formatClock(liveSeconds)}
            {activeRunning.description ? (
              <span className="ml-2 font-sans text-sm font-normal text-[var(--muted)]">
                {activeRunning.description}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMessage(null);
              const entryId = activeRunning.id;
              startTransition(async () => {
                const result = await stopTimer(
                  projectId,
                  listId,
                  taskId,
                  entryId,
                );
                if (result && "error" in result) {
                  setError(result.error ?? "Could not stop timer.");
                } else {
                  setActiveRunning(null);
                  setMessage("Timer stopped.");
                  setNote("");
                  await refreshEntries(
                    projectId,
                    listId,
                    taskId,
                    setEntries,
                    setError,
                  );
                  router.refresh();
                }
              });
            }}
            className="min-h-9 shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Stopping…" : "Stop"}
          </button>
        </div>
      ) : runningElsewhere ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Timer is running on another task.
        </p>
      ) : (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const result = await startTimer(
                projectId,
                listId,
                taskId,
                formData,
              );
              if (result && "error" in result) {
                setError(result.error ?? "Could not start timer.");
              } else if (result && "entry" in result) {
                setActiveRunning(result.entry);
                setMessage("Timer started.");
                setNote("");
                form.reset();
                router.refresh();
              }
            });
          }}
        >
          <input
            name="description"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Timer note"
            aria-label="Timer note"
            className={`${fieldClassName} min-w-0 flex-1`}
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-9 shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Starting…" : "Start"}
          </button>
        </form>
      )}

      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const durationRaw = String(formData.get("duration") ?? "");
          if (parseDurationToSeconds(durationRaw) == null) {
            setError("Enter time like 45m or 1h 15.");
            setMessage(null);
            durationInputRef.current?.focus();
            return;
          }
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await addManualTimeEntry(
              projectId,
              listId,
              taskId,
              formData,
            );
            if (result && "error" in result) {
              setError(result.error ?? "Could not add time.");
            } else {
              setMessage("Time added.");
              form.reset();
              durationInputRef.current?.focus();
              await refreshEntries(
                projectId,
                listId,
                taskId,
                setEntries,
                setError,
              );
              router.refresh();
            }
          });
        }}
      >
        <input
          ref={durationInputRef}
          name="duration"
          placeholder="45m"
          title="45, 45m, 1h 15, or 1:15"
          autoComplete="off"
          aria-label="Duration"
          className={`${fieldClassName} w-24`}
        />
        <input
          name="date"
          type="date"
          required
          defaultValue={todayInputValue()}
          aria-label="Date"
          className={`${fieldClassName} w-[9.75rem]`}
        />
        <input
          name="description"
          placeholder="Note"
          aria-label="Note"
          className={`${fieldClassName} min-w-[7rem] flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-9 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>

      {loading || entries.length > 0 || !runningOnThisTask ? (
        <ul className="mt-3 max-h-48 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
          {loading ? (
            <li className="py-2 text-sm text-[var(--muted)]">Loading…</li>
          ) : entries.length === 0 ? (
            <li className="py-2 text-sm text-[var(--muted)]">No time yet.</li>
          ) : (
            entries.map((entry) => {
              const mine = entry.user_id === currentUserId;
              const canDelete = mine || isAdmin;
              const detail = [
                mine ? "you" : personLabel(entry),
                entry.description,
                formatDate(entry.started_at),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 py-1.5 text-sm"
                >
                  <p className="min-w-0 truncate">
                    <span className="font-medium tabular-nums">
                      {formatDuration(entry.duration_seconds ?? 0)}
                    </span>
                    <span className="text-[var(--muted)]"> · {detail}</span>
                  </p>
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm("Delete this time entry?")) {
                          return;
                        }
                        setError(null);
                        startTransition(async () => {
                          const result = await deleteTimeEntry(
                            projectId,
                            listId,
                            taskId,
                            entry.id,
                          );
                          if (result && "error" in result) {
                            setError(result.error ?? "Could not delete.");
                          } else {
                            setEntries((prev) =>
                              prev.filter((item) => item.id !== entry.id),
                            );
                            router.refresh();
                          }
                        });
                      }}
                      className="shrink-0 text-xs text-[var(--danger)] hover:underline disabled:opacity-60"
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-[var(--accent)]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
