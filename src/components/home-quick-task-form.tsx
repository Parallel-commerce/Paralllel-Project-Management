"use client";

import { useMemo, useState, useTransition } from "react";

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
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => lists.find((list) => list.id === listId) ?? null,
    [lists, listId],
  );

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

      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        List
        <select
          value={listId}
          onChange={(event) => setListId(event.target.value)}
          required
          className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.projectName} · {list.name}
            </option>
          ))}
        </select>
      </label>

      <DueDatePicker name="due_date" label="Due date (optional)" />

      <button
        type="submit"
        disabled={pending || !listId}
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
