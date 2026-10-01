"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { sendStandingProjectReport } from "@/lib/actions/reports";

export type HomeReportChoice = {
  key: string;
  label: string | null;
  title: string | null;
  openHref: string | null;
  reportId: string | null;
  sentLabel: string | null;
  note: string | null;
  canSend: boolean;
  needsRecipients: boolean;
};

export function HomeReportMenu({
  projectId,
  projectName,
  label,
  choices,
}: {
  projectId: string;
  projectName: string;
  label: string;
  choices: HomeReportChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const ready = choices.some((choice) => choice.canSend);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${label} for ${projectName}`}
        onClick={() => {
          setOpen((value) => !value);
          setError(null);
        }}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        {label}
        {ready ? (
          <span className="text-xs font-medium text-[var(--accent)]">Ready</span>
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg"
        >
          {choices.map((choice) => (
            <div key={choice.key} className="px-2 py-2">
              {choice.label ? (
                <p className="text-xs font-medium text-[var(--muted)]">{choice.label}</p>
              ) : null}
              {choice.title ? (
                <p className="mt-0.5 text-sm">{choice.title}</p>
              ) : null}
              {choice.note ? (
                <p className="mt-0.5 text-sm text-[var(--muted)]">{choice.note}</p>
              ) : null}
              {choice.sentLabel ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{choice.sentLabel}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {choice.openHref ? (
                  <Link
                    href={choice.openHref}
                    role="menuitem"
                    className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-sm font-medium hover:bg-[var(--surface-2)]"
                  >
                    Open
                  </Link>
                ) : (
                  <Link
                    href={`/projects/${projectId}/reports`}
                    role="menuitem"
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Reports
                  </Link>
                )}
                {choice.canSend && choice.reportId ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setMessage(null);
                      setPendingId(choice.reportId);
                      startTransition(async () => {
                        const result = await sendStandingProjectReport(
                          projectId,
                          choice.reportId as string,
                        );
                        setPendingId(null);
                        if ("error" in result) {
                          setError(result.error);
                          return;
                        }
                        setMessage(result.message);
                        setOpen(false);
                      });
                    }}
                    className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
                  >
                    {pending && pendingId === choice.reportId ? "Sending…" : "Send"}
                  </button>
                ) : null}
                {choice.needsRecipients ? (
                  <Link
                    href={`/projects/${projectId}/settings`}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Add recipients
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {error ? (
            <p className="px-2 pb-1 text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="px-2 pb-1 text-xs text-[var(--accent)]" role="status">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
