"use client";

import { useState, useTransition } from "react";

import {
  deleteProjectReport,
  sendProjectReport,
  updateReportNarrative,
} from "@/lib/actions/reports";
import type { ReportKind } from "@/types/database";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

function parseEmailList(raw: string) {
  return raw
    .split(/[,;\n]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

export function ReportEditor({
  projectId,
  reportId,
  title,
  narrative,
  clients,
  sentTo,
  kind = "progress",
}: {
  projectId: string;
  reportId: string;
  title: string;
  narrative: string | null;
  clients: { email: string; label: string }[];
  sentTo: string[];
  kind?: ReportKind;
}) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [extraDraft, setExtraDraft] = useState("");

  function addExtraEmails() {
    const next = parseEmailList(extraDraft);
    if (next.length === 0) return;
    const invalid = next.find((email) => !EMAIL_RE.test(email));
    if (invalid) {
      setError(`“${invalid}” is not a valid email address.`);
      return;
    }
    setError(null);
    setExtraEmails((current) => [...new Set([...current, ...next])]);
    setExtraDraft("");
  }

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
            rows={kind === "store" ? 24 : 10}
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
          for (const email of extraEmails) {
            formData.append("recipients", email);
          }
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
              setExtraEmails([]);
              setExtraDraft("");
            }
          });
        }}
      >
        <h2 className="font-medium">Email report</h2>
        <p className="text-sm text-[var(--muted)]">
          {kind === "store"
            ? "Sends the store report narrative. You can include people who are not in Parallel. Requires Resend."
            : "Sends the narrative plus a short stats snapshot. You can include people who are not in Parallel. Requires Resend."}
        </p>
        {clients.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No client members on this project. Add email addresses below.
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
                    defaultChecked={
                      !sentTo
                        .map((email) => email.toLowerCase())
                        .includes(client.email.toLowerCase())
                    }
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

        <div className="flex flex-col gap-2">
          <label className="text-sm text-[var(--muted)]" htmlFor="extra-recipients">
            Additional emails
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="extra-recipients"
              name="extra_recipients"
              type="text"
              value={extraDraft}
              onChange={(event) => setExtraDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addExtraEmails();
                }
              }}
              placeholder="name@example.com"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
            <button
              type="button"
              onClick={addExtraEmails}
              disabled={pending || !extraDraft.trim()}
              className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Separate multiple addresses with commas. They do not need a Parallel
            login.
          </p>
          {extraEmails.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {extraEmails.map((email) => (
                <li
                  key={email}
                  className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 py-1 text-sm"
                >
                  {email}
                  <button
                    type="button"
                    aria-label={`Remove ${email}`}
                    onClick={() =>
                      setExtraEmails((current) =>
                        current.filter((item) => item !== email),
                      )
                    }
                    className="px-1 text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
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
