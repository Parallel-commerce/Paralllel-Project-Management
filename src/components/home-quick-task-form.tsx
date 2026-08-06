"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { DueDatePicker } from "@/components/due-date-picker";
import { createTask } from "@/lib/actions/projects";

export type HomeListOption = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
};

export function HomeQuickTaskForm({
  lists,
  currentUserId,
}: {
  lists: HomeListOption[];
  currentUserId: string;
}) {
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [listOpen, setListOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listPickerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => lists.find((list) => list.id === listId) ?? lists[0] ?? null,
    [lists, listId],
  );

  useEffect(() => {
    if (!listId && lists[0]?.id) {
      setListId(lists[0].id);
    }
  }, [listId, lists]);

  useEffect(() => {
    if (!listOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!listPickerRef.current?.contains(event.target as Node)) {
        setListOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setListOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [listOpen]);

  if (lists.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Create or join a project with a list before adding tasks here.
      </p>
    );
  }

  return (
    <form
      key={formKey}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected) {
          setError("Choose a list.");
          return;
        }
        const formData = new FormData(event.currentTarget);
        formData.set("assigned_to", currentUserId);
        formData.set("reported_by", currentUserId);
        formData.set("status", "todo");
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await createTask(
            selected.projectId,
            selected.id,
            formData,
          );
          if (result?.error) {
            setError(result.error);
            return;
          }
          setMessage("Task created.");
          event.currentTarget.reset();
          setListId(lists[0]?.id ?? "");
          setListOpen(false);
          setFormKey((value) => value + 1);
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Title
        <input
          name="title"
          required
          placeholder="What needs doing?"
          className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
      </label>

      <div ref={listPickerRef} className="relative flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        <span id="home-list-label">List</span>
        <input type="hidden" name="list_id" value={selected?.id ?? ""} />
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={listOpen}
          aria-labelledby="home-list-label"
          disabled={pending}
          onClick={() => setListOpen((open) => !open)}
          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2 disabled:opacity-60"
        >
          <span className="min-w-0 truncate">
            {selected
              ? `${selected.projectName} · ${selected.name}`
              : "Choose a list"}
          </span>
          <span aria-hidden className="shrink-0 text-[var(--muted)]">
            ▾
          </span>
        </button>

        {listOpen ? (
          <ul
            role="listbox"
            aria-labelledby="home-list-label"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
          >
            {lists.map((list) => {
              const isSelected = list.id === selected?.id;
              return (
                <li key={list.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setListId(list.id);
                      setListOpen(false);
                      setError(null);
                    }}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--accent-soft)] ${
                      isSelected
                        ? "bg-[var(--accent-soft)]/70 text-[var(--accent)]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    <span className="font-medium">{list.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {list.projectName}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <DueDatePicker name="due_date" label="Due date (optional)" />

      <button
        type="submit"
        disabled={pending || !selected}
        className="min-h-10 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Creating…" : "Create task"}
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
    </form>
  );
}
