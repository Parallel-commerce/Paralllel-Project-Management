"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createCompanyNote,
  deleteCompanyNote,
  updateCompanyNote,
} from "@/lib/actions/crm";
import type { CompanyTimelineKind } from "@/types/database";

const fieldClass =
  "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";

export type CompanyTimelineItem = {
  id: string;
  kind: CompanyTimelineKind;
  body: string;
  occurredOn: string;
  dayLabel: string;
  recordedLabel: string;
  authorName: string;
};

function NoteForm({
  companyId,
  note,
  today,
  onDone,
}: {
  companyId: string;
  note?: CompanyTimelineItem;
  today: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={
        note
          ? "flex flex-col gap-3"
          : "flex flex-col gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 p-4"
      }
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setError(null);
        startTransition(async () => {
          const result = note
            ? await updateCompanyNote(companyId, note.id, formData)
            : await createCompanyNote(companyId, formData);
          if (result?.error) {
            setError(result.error);
            return;
          }
          if (note) {
            onDone?.();
          } else {
            form.reset();
          }
          router.refresh();
        });
      }}
    >
      {note ? null : <p className="text-sm font-medium">Add a note</p>}
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        {note ? "Note" : "What happened"}
        <textarea
          name="body"
          required
          rows={3}
          defaultValue={note?.body ?? ""}
          placeholder="Called, sent a proposal, agreed next steps…"
          className={fieldClass}
        />
      </label>
      <label className="flex max-w-48 flex-col gap-1.5 text-sm text-[var(--muted)]">
        When it happened
        <input
          type="date"
          name="occurred_on"
          required
          defaultValue={note?.occurredOn ?? today}
          className={fieldClass}
        />
      </label>
      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Saving…" : note ? "Save" : "Add note"}
        </button>
        {note ? (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
            onClick={onDone}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function TimelineEntry({
  companyId,
  entry,
}: {
  companyId: string;
  entry: CompanyTimelineItem;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isNote = entry.kind === "note";

  return (
    <li className="relative">
      <span
        className={`absolute -left-[1.3125rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--background)] ${
          isNote ? "bg-[var(--accent)]" : "bg-[var(--muted)]"
        }`}
        aria-hidden
      />
      {editing ? (
        <NoteForm
          companyId={companyId}
          note={entry}
          today={entry.occurredOn}
          onDone={() => {
            setEditing(false);
            setError(null);
          }}
        />
      ) : (
        <div>
          <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {entry.authorName} · {entry.recordedLabel}
          </p>
          {isNote ? (
            <div className="mt-1.5 flex gap-3">
              <button
                type="button"
                className="text-xs text-[var(--accent)] hover:underline"
                onClick={() => {
                  setEditing(true);
                  setError(null);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                className="text-xs text-[var(--danger)] hover:underline disabled:opacity-60"
                onClick={() => {
                  if (!window.confirm("Delete this note?")) return;
                  setError(null);
                  startTransition(async () => {
                    const result = await deleteCompanyNote(companyId, entry.id);
                    if (result?.error) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="mt-1 text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function CompanyTimeline({
  companyId,
  entries,
  today,
}: {
  companyId: string;
  entries: CompanyTimelineItem[];
  today: string;
}) {
  const groups: { day: string; label: string; entries: CompanyTimelineItem[] }[] =
    [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.day === entry.occurredOn) {
      last.entries.push(entry);
    } else {
      groups.push({
        day: entry.occurredOn,
        label: entry.dayLabel,
        entries: [entry],
      });
    }
  }

  return (
    <section>
      <h2 className="font-medium">Timeline</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Notes and changes on this company, newest first. Date a note for the
        day it happened.
      </p>

      <div className="mt-4">
        <NoteForm companyId={companyId} today={today} />
      </div>

      {groups.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nothing recorded yet. Add a note to start the timeline.
        </p>
      ) : (
        <ol className="mt-6 space-y-6">
          {groups.map((group) => (
            <li key={group.day}>
              <h3 className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                {group.label}
              </h3>
              <ol className="relative mt-3 space-y-4 border-l border-[var(--border)] pl-5">
                {group.entries.map((entry) => (
                  <TimelineEntry
                    key={entry.id}
                    companyId={companyId}
                    entry={entry}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
