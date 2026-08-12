"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  addManualTimeEntry,
  deleteTimeEntry,
  listTaskTimeEntries,
  startTimer,
  stopTimer,
} from "@/lib/actions/time";
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

  return (
    <section className="mt-5 border-t border-[var(--border)] pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Time tracking</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Internal only — clients never see this.
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums">
          {loading ? "…" : formatDuration(totalSeconds)}
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 px-3 py-3">
        {runningOnThisTask && activeRunning ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Timer running
              </p>
              <p className="mt-1 font-display text-2xl tabular-nums tracking-tight">
                {formatClock(liveSeconds)}
              </p>
              {activeRunning.description ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {activeRunning.description}
                </p>
              ) : null}
            </div>
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
              className="min-h-10 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Stopping…" : "Stop timer"}
            </button>
          </div>
        ) : runningElsewhere ? (
          <p className="text-sm text-[var(--muted)]">
            You already have a timer running on another task. Stop it there
            before starting here.
          </p>
        ) : (
          <form
            className="flex flex-col gap-2"
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
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              What are you working on?
              <input
                name="description"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note"
                className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="min-h-10 self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Starting…" : "Start timer"}
            </button>
          </form>
        )}
      </div>

      <form
        className="mt-4 grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
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
              setMessage("Manual time added.");
              form.reset();
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
        <p className="sm:col-span-2 text-sm font-medium">Add time manually</p>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Date
          <input
            name="date"
            type="date"
            required
            defaultValue={todayInputValue()}
            className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Hours
            <input
              name="hours"
              type="number"
              min={0}
              max={24}
              defaultValue={0}
              className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Minutes
            <input
              name="minutes"
              type="number"
              min={0}
              max={59}
              defaultValue={30}
              className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)] sm:col-span-2">
          Note
          <input
            name="description"
            placeholder="Optional"
            className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)] disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
        >
          {pending ? "Saving…" : "Log time"}
        </button>
      </form>

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <h4 className="text-sm font-medium">Entries on this task</h4>
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {loading ? (
            <li className="text-sm text-[var(--muted)]">Loading entries…</li>
          ) : entries.length === 0 && !runningOnThisTask ? (
            <li className="text-sm text-[var(--muted)]">No time logged yet.</li>
          ) : (
            <>
              {runningOnThisTask && activeRunning ? (
                <li className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)]/50 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">Running · you</p>
                      <p className="mt-0.5 text-[var(--muted)]">
                        {activeRunning.description || "No note"}
                      </p>
                    </div>
                    <span className="tabular-nums">
                      {formatClock(liveSeconds)}
                    </span>
                  </div>
                </li>
              ) : null}
              {entries.map((entry) => {
                const mine = entry.user_id === currentUserId;
                const canDelete = mine || isAdmin;
                return (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatDuration(entry.duration_seconds ?? 0)}
                          <span className="font-normal text-[var(--muted)]">
                            {" "}
                            · {mine ? "you" : personLabel(entry)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[var(--muted)]">
                          {entry.description || "No note"}
                          {" · "}
                          {entry.source === "manual" ? "manual" : "timer"}
                          {" · "}
                          {new Date(entry.started_at).toLocaleDateString()}
                        </p>
                      </div>
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
                    </div>
                  </li>
                );
              })}
            </>
          )}
        </ul>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-[var(--accent)]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
