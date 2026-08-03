"use client";

import { useState, useTransition } from "react";

import {
  deleteProjectReport,
  sendProjectReport,
  updateReportNarrative,
} from "@/lib/actions/reports";

export function ReportEditor({
  projectId,
  reportId,
  title,
  narrative,
  clients,
  sentTo,
}: {
  projectId: string;
  reportId: string;
  title: string;
  narrative: string | null;
  clients: { email: string; label: string }[];
  sentTo: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          setMessage(null);
              startTransition(async () => {
                const result = await updateReportNarrative(
                  projectId,
                  reportId,
                  formData,
                );
                if (result && "error" in result) {
                  setError(result.error);
                } else {
                  setMessage("Saved.");
                }
              });
        }}
      >
        <h2 className="font-medium">Edit report</h2>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Title
          <input
            name="title"
            required
            defaultValue={title}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Narrative
          <textarea
            name="narrative"
            rows={10}
            defaultValue={narrative ?? ""}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <form
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          setMessage(null);
            startTransition(async () => {
              const result = await sendProjectReport(
                projectId,
                reportId,
                formData,
              );
              if ("error" in result) {
                setError(result.error);
              } else {
                setMessage(result.message);
              }
            });
        }}
      >
        <h2 className="font-medium">Email to clients</h2>
        <p className="text-sm text-[var(--muted)]">
          Sends the narrative plus a short stats snapshot. Requires Resend.
        </p>
        {clients.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No client members on this project yet. Invite clients first, or add
            their emails as members with the client role.
          </p>
        ) : (
          <ul className="space-y-2">
            {clients.map((client) => (
              <li key={client.email}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="recipients"
                    value={client.email}
                    defaultChecked={!sentTo.includes(client.email)}
                  />
                  <span>
                    {client.label}
                    <span className="text-[var(--muted)]"> · {client.email}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          disabled={pending || clients.length === 0}
          className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this report?")) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteProjectReport(projectId, reportId);
            if (result && "error" in result) setError(result.error);
          });
        }}
        className="text-sm text-[var(--danger)] hover:underline disabled:opacity-60"
      >
        Delete report
      </button>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-[var(--accent)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
