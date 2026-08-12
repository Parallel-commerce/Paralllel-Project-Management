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

type ProjectOption = {
  id: string;
  name: string;
};

function OptionPicker({
  label,
  valueLabel,
  placeholder,
  open,
  onToggle,
  disabled,
  children,
}: {
  label: string;
  valueLabel: string | null;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const labelId = `${label.toLowerCase().replace(/\s+/g, "-")}-label`;

  return (
    <div className="relative flex flex-col gap-1.5 text-sm text-[var(--muted)]">
      <span id={labelId}>{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={onToggle}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2 disabled:opacity-60"
      >
        <span className="min-w-0 truncate">
          {valueLabel ?? placeholder}
        </span>
        <span aria-hidden className="shrink-0 text-[var(--muted)]">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {children}
        </ul>
      ) : null}
    </div>
  );
}

function initialProjectId(lists: HomeListOption[]) {
  const ids = [...new Set(lists.map((list) => list.projectId))];
  return ids.length === 1 ? ids[0] : "";
}

function initialListId(lists: HomeListOption[], projectId: string) {
  if (!projectId) return "";
  const inProject = lists.filter((list) => list.projectId === projectId);
  return inProject.length === 1 ? inProject[0].id : "";
}

export function HomeQuickTaskForm({
  lists,
  currentUserId,
}: {
  lists: HomeListOption[];
  currentUserId: string;
}) {
  const projects = useMemo(() => {
    const map = new Map<string, ProjectOption>();
    for (const list of lists) {
      if (!map.has(list.projectId)) {
        map.set(list.projectId, {
          id: list.projectId,
          name: list.projectName,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [lists]);

  const [projectId, setProjectId] = useState(() => initialProjectId(lists));
  const [listId, setListId] = useState(() =>
    initialListId(lists, initialProjectId(lists)),
  );
  const [projectOpen, setProjectOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const listPickerRef = useRef<HTMLDivElement>(null);

  const listsForProject = useMemo(
    () =>
      lists
        .filter((list) => list.projectId === projectId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lists, projectId],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  );

  const selectedList = useMemo(
    () => listsForProject.find((list) => list.id === listId) ?? null,
    [listsForProject, listId],
  );

  useEffect(() => {
    if (projects.length === 1 && projectId !== projects[0].id) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  useEffect(() => {
    if (!projectId) {
      setListId("");
      return;
    }
    if (listsForProject.length === 1) {
      setListId(listsForProject[0].id);
      return;
    }
    if (listId && !listsForProject.some((list) => list.id === listId)) {
      setListId("");
    }
  }, [projectId, listsForProject, listId]);

  useEffect(() => {
    if (!projectOpen && !listOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        projectOpen &&
        projectPickerRef.current &&
        !projectPickerRef.current.contains(target)
      ) {
        setProjectOpen(false);
      }
      if (
        listOpen &&
        listPickerRef.current &&
        !listPickerRef.current.contains(target)
      ) {
        setListOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProjectOpen(false);
        setListOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [projectOpen, listOpen]);

  if (lists.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Create or join a project with a list before adding tasks here.
      </p>
    );
  }

  function resetSelection() {
    const nextProjectId = initialProjectId(lists);
    setProjectId(nextProjectId);
    setListId(initialListId(lists, nextProjectId));
    setProjectOpen(false);
    setListOpen(false);
  }

  return (
    <form
      key={formKey}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selectedProject) {
          setError("Choose a project.");
          return;
        }
        if (!selectedList) {
          setError("Choose a list.");
          return;
        }
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set("assigned_to", currentUserId);
        formData.set("reported_by", currentUserId);
        formData.set("status", "todo");
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await createTask(
            selectedList.projectId,
            selectedList.id,
            formData,
          );
          if (result?.error) {
            setError(result.error);
            return;
          }
          setMessage("Task created.");
          form.reset();
          resetSelection();
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

      <div ref={projectPickerRef}>
        <OptionPicker
          label="Project"
          valueLabel={selectedProject?.name ?? null}
          placeholder="Choose a project"
          open={projectOpen}
          disabled={pending || projects.length === 1}
          onToggle={() => {
            if (projects.length === 1) return;
            setListOpen(false);
            setProjectOpen((open) => !open);
          }}
        >
          {projects.map((project) => {
            const isSelected = project.id === selectedProject?.id;
            return (
              <li key={project.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setProjectId(project.id);
                    setProjectOpen(false);
                    setError(null);
                  }}
                  className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition hover:bg-[var(--accent-soft)] ${
                    isSelected
                      ? "bg-[var(--accent-soft)]/70 font-medium text-[var(--accent)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {project.name}
                </button>
              </li>
            );
          })}
        </OptionPicker>
      </div>

      <div ref={listPickerRef}>
        <OptionPicker
          label="List"
          valueLabel={selectedList?.name ?? null}
          placeholder={
            projectId ? "Choose a list" : "Select a project first"
          }
          open={listOpen}
          disabled={pending || !projectId || listsForProject.length === 0}
          onToggle={() => {
            if (!projectId) return;
            setProjectOpen(false);
            setListOpen((open) => !open);
          }}
        >
          {listsForProject.map((list) => {
            const isSelected = list.id === selectedList?.id;
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
                  className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition hover:bg-[var(--accent-soft)] ${
                    isSelected
                      ? "bg-[var(--accent-soft)]/70 font-medium text-[var(--accent)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {list.name}
                </button>
              </li>
            );
          })}
        </OptionPicker>
      </div>

      <DueDatePicker name="due_date" label="Due date (optional)" />

      <button
        type="submit"
        disabled={pending || !selectedProject || !selectedList}
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
