"use client";

import { useState, useTransition } from "react";

import {
  addProjectReportRecipient,
  removeProjectReportRecipient,
} from "@/lib/actions/reports";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(raw: string) {
  return raw
    .split(/[,;\n]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function ReportRecipientSettings({
  projectId,
  emails,
}: {
  projectId: string;
  emails: string[];
}) {
  const [savedEmails, setSavedEmails] = useState(emails);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addEmails() {
    const next = parseEmailList(draft);
    if (next.length === 0) return;
    const invalid = next.find(
      (email) => !EMAIL_RE.test(email) || email.length > 320,
    );
    if (invalid) {
      setError(`“${invalid}” is not a valid email address.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const saved: string[] = [];
      for (const email of next) {
        const result = await addProjectReportRecipient(projectId, email);
        if ("error" in result) {
          if (saved.length) {
            setSavedEmails((current) => [...new Set([...current, ...saved])]);
          }
          setError(result.error);
          return;
        }
        saved.push(result.email);
      }
      setSavedEmails((current) => [...new Set([...current, ...saved])]);
      setDraft("");
    });
  }

  function removeEmail(email: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeProjectReportRecipient(projectId, email);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSavedEmails((current) => current.filter((item) => item !== email));
    });
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Report recipients</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        These addresses receive every report for this project. They do not need
        a Parallel login.
      </p>
      {savedEmails.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {savedEmails.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>{email}</span>
              <button
                type="button"
                onClick={() => removeEmail(email)}
                disabled={pending}
                className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">
          No saved addresses yet.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEmails();
            }
          }}
          placeholder="name@example.com"
          aria-label="Report recipient email"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
        <button
          type="button"
          onClick={addEmails}
          disabled={pending || !draft.trim()}
          className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add"}
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Separate multiple addresses with commas.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
