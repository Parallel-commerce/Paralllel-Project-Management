"use client";

import { useEffect, useState } from "react";

import {
  listTaskStatusHistory,
  type TaskStatusHistoryRow,
} from "@/lib/actions/projects";
import { personDisplayName } from "@/lib/person";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: TaskStatus | null) {
  if (!status) return "—";
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function TaskStatusHistory({
  projectId,
  taskId,
  refreshKey = 0,
}: {
  projectId: string;
  taskId: string;
  refreshKey?: number;
}) {
  const [events, setEvents] = useState<TaskStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTaskStatusHistory(projectId, taskId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setEvents([]);
      } else {
        setError(null);
        setEvents(result.events);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId, refreshKey]);

  const latest = events.length > 0 ? events[events.length - 1] : null;

  return (
    <section className="mt-5 border-t border-[var(--border)] pt-5">
      <h3 className="text-sm font-medium">Status history</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        When this task moved into each status.
      </p>

      {latest?.to ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">{statusLabel(latest.to)}</span>
          <span className="text-[var(--muted)]">
            {" "}
            since {formatWhen(latest.created_at)}
          </span>
        </p>
      ) : null}

      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {loading ? (
          <li className="text-sm text-[var(--muted)]">Loading history…</li>
        ) : error ? (
          <li className="text-sm text-[var(--danger)]">{error}</li>
        ) : events.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            No status changes recorded yet. New moves will appear here with a
            date and time.
          </li>
        ) : (
          [...events].reverse().map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <p className="font-medium">
                {event.from
                  ? `${statusLabel(event.from)} → ${statusLabel(event.to)}`
                  : `Opened as ${statusLabel(event.to)}`}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {personDisplayName(event.actor, "Someone")} ·{" "}
                {formatWhen(event.created_at)}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
