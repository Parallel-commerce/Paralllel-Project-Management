"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { CompanyEnrichButton } from "@/components/company-enrich-button";
import { CompanyVerticalField } from "@/components/company-vertical-field";
import {
  addCompanyVertical,
  deleteCompany,
  removeCompanyVertical,
  updateCompany,
  updateCompanyLookup,
} from "@/lib/actions/crm";
import {
  COMPANY_REENGAGE_OPTIONS,
  companyReengageValue,
} from "@/lib/company-reengage";
import { dateInputValue } from "@/lib/format-date";
import type { VerticalOption } from "@/lib/verticals";
import { COMPANY_KINDS, COMPANY_STATUSES, type Company } from "@/types/database";

function lookupSnapshot(form: HTMLFormElement) {
  const formData = new FormData(form);
  return JSON.stringify({
    summary: String(formData.get("summary") ?? "").trim(),
    linkedin_url: String(formData.get("linkedin_url") ?? "").trim(),
  });
}

function companySnapshot(form: HTMLFormElement) {
  const formData = new FormData(form);
  return JSON.stringify({
    name: String(formData.get("name") ?? "").trim(),
    website: String(formData.get("website") ?? "").trim(),
    kind: String(formData.get("kind") ?? ""),
    status: String(formData.get("status") ?? ""),
    can_reengage: String(formData.get("can_reengage") ?? ""),
    follow_up_at: String(formData.get("follow_up_at") ?? "").trim(),
    follow_up_note: String(formData.get("follow_up_note") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });
}

export function CompanyEditor({
  company,
  verticals,
  selectedVerticals,
}: {
  company: Company;
  verticals: VerticalOption[];
  selectedVerticals: VerticalOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const lastSavedLookupRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const persistRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [pending, startTransition] = useTransition();
  const [assignedVerticals, setAssignedVerticals] =
    useState<VerticalOption[]>(selectedVerticals);
  const [verticalPending, setVerticalPending] = useState(false);

  useEffect(() => {
    setAssignedVerticals(selectedVerticals);
  }, [selectedVerticals]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const summaryField = form.elements.namedItem("summary");
    const linkedinField = form.elements.namedItem("linkedin_url");
    if (summaryField instanceof HTMLTextAreaElement) {
      summaryField.value = company.summary ?? "";
    }
    if (linkedinField instanceof HTMLInputElement) {
      linkedinField.value = company.linkedin_url ?? "";
    }
    lastSavedSnapshotRef.current = companySnapshot(form);
    lastSavedLookupRef.current = lookupSnapshot(form);
    setSaveState("idle");
    setError(null);
  }, [
    company.id,
    company.summary,
    company.linkedin_url,
    company.enriched_at,
  ]);

  async function persist() {
    const form = formRef.current;
    if (!form) return;

    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }

    const snapshot = companySnapshot(form);
    const parsed = JSON.parse(snapshot) as { name: string };
    if (!parsed.name) {
      setError("Company name is required.");
      setSaveState("error");
      return;
    }
    if (snapshot === lastSavedSnapshotRef.current) return;

    savingRef.current = true;
    setSaveState("saving");
    setError(null);

    const formData = new FormData(form);
    const result = await updateCompany(company.id, formData);

    savingRef.current = false;
    if (!mountedRef.current) return;
    if (queuedRef.current) {
      queuedRef.current = false;
      await persist();
      return;
    }

    if (result?.error) {
      setError(result.error);
      setSaveState("error");
      return;
    }

    lastSavedSnapshotRef.current = snapshot;
    setError(null);
    setSaveState("saved");
    router.refresh();
  }

  async function persistLookup() {
    const form = formRef.current;
    if (!form) return;
    const snapshot = lookupSnapshot(form);
    if (snapshot === lastSavedLookupRef.current) return;

    const formData = new FormData(form);
    setSaveState("saving");
    setError(null);
    const result = await updateCompanyLookup(company.id, formData);
    if (!mountedRef.current) return;
    if (result?.error) {
      setError(result.error);
      setSaveState("error");
      return;
    }
    lastSavedLookupRef.current = snapshot;
    setError(null);
    setSaveState("saved");
    router.refresh();
  }

  persistRef.current = () => {
    void persist();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        persistRef.current();
      }
    };
  }, []);

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist();
    }, 650);
  }

  function saveNow() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void persist();
  }

  function saveLookup() {
    void persistLookup();
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-medium">Company</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Type, sales status, whether they can be re-engaged, the verticals
            they work in, a company summary, notes, and a follow-up date if they
            need another pass.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p
            className={`text-xs ${
              saveState === "error"
                ? "text-[var(--danger)]"
                : "text-[var(--muted)]"
            }`}
            aria-live="polite"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Couldn’t save"
                  : "Changes save automatically"}
          </p>
          <CompanyEnrichButton
            companyId={company.id}
            enrichedAt={company.enriched_at}
          />
        </div>
      </div>

      <form
        ref={formRef}
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          saveNow();
        }}
        onInput={(event) => {
          const target = event.target as HTMLElement;
          if (
            !(
              target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement ||
              target instanceof HTMLSelectElement
            ) ||
            !target.name
          ) {
            return;
          }
          if (target.name === "summary" || target.name === "linkedin_url") {
            return;
          }
          scheduleSave();
        }}
        onChange={(event) => {
          const target = event.target as HTMLElement;
          if (
            target instanceof HTMLSelectElement ||
            (target instanceof HTMLInputElement && target.type === "date")
          ) {
            saveNow();
          }
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Name
          <input
            name="name"
            required
            defaultValue={company.name}
            onBlur={saveNow}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Website
            <input
              name="website"
              defaultValue={company.website ?? ""}
              placeholder="https://"
              onBlur={saveNow}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            LinkedIn
            <input
              name="linkedin_url"
              defaultValue={company.linkedin_url ?? ""}
              placeholder="https://www.linkedin.com/company/"
              onBlur={saveLookup}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Summary
          <textarea
            name="summary"
            rows={4}
            defaultValue={company.summary ?? ""}
            placeholder="Look up the company to draft this, or write it yourself."
            onBlur={saveLookup}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Type
            <select
              name="kind"
              defaultValue={company.kind}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            >
              {COMPANY_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Status
            <select
              name="status"
              defaultValue={company.status}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            >
              {COMPANY_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Can re-engage
            <select
              name="can_reengage"
              defaultValue={companyReengageValue(company.can_reengage)}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            >
              {COMPANY_REENGAGE_OPTIONS.map((option) => (
                <option key={option.value || "unset"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CompanyVerticalField
          selected={assignedVerticals}
          options={verticals}
          disabled={verticalPending}
          onAdd={(input) => {
            const previous = assignedVerticals;
            const optimistic: VerticalOption = {
              id: input.id ?? `new:${input.name.toLowerCase()}`,
              name: input.name,
            };
            if (
              previous.some(
                (item) =>
                  item.id === optimistic.id ||
                  item.name.localeCompare(input.name, undefined, {
                    sensitivity: "accent",
                  }) === 0,
              )
            ) {
              return;
            }
            setAssignedVerticals([...previous, optimistic]);
            setVerticalPending(true);
            setSaveState("saving");
            setError(null);
            void addCompanyVertical(company.id, input).then((result) => {
              if (!mountedRef.current) return;
              setVerticalPending(false);
              if (result && "error" in result) {
                setAssignedVerticals(previous);
                setError(result.error);
                setSaveState("error");
                return;
              }
              setAssignedVerticals((current) =>
                current.map((item) =>
                  item.id === optimistic.id ? result : item,
                ),
              );
              setSaveState("saved");
              router.refresh();
            });
          }}
          onRemove={(verticalId) => {
            const previous = assignedVerticals;
            setAssignedVerticals(
              previous.filter((item) => item.id !== verticalId),
            );
            if (verticalId.startsWith("new:")) return;
            setVerticalPending(true);
            setSaveState("saving");
            setError(null);
            void removeCompanyVertical(company.id, verticalId).then((result) => {
              if (!mountedRef.current) return;
              setVerticalPending(false);
              if (result?.error) {
                setAssignedVerticals(previous);
                setError(result.error);
                setSaveState("error");
                return;
              }
              setSaveState("saved");
              router.refresh();
            });
          }}
        />
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Follow up on
          <input
            type="date"
            name="follow_up_at"
            defaultValue={dateInputValue(company.follow_up_at)}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Follow-up note
          <input
            name="follow_up_note"
            defaultValue={company.follow_up_note ?? ""}
            placeholder="Why to follow up, or who to call"
            onBlur={saveNow}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Notes
          <textarea
            name="notes"
            rows={4}
            defaultValue={company.notes ?? ""}
            onBlur={saveNow}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this company and its contacts? Linked projects stay, but the CRM record is gone.",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const result = await deleteCompany(company.id);
                if (result?.error) {
                  setError(result.error);
                  setSaveState("error");
                }
              });
            }}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </form>
    </section>
  );
}
