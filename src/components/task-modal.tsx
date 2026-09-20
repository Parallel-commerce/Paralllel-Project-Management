"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { DueDatePicker } from "@/components/due-date-picker";
import { TaskAttachments } from "@/components/task-attachments";
import { TaskComments } from "@/components/task-comments";
import { TaskTypeTag } from "@/components/task-type-tag";
import { TaskStatusHistory } from "@/components/task-status-history";
import {
  TimeTrackingPanel,
  type TimeEntryRow,
} from "@/components/time-tracking-panel";
import {
  createTask,
  deleteTask,
  updateTask,
} from "@/lib/actions/projects";
import { listThemeDeploys } from "@/lib/actions/theme-deploys";
import { personDisplayName } from "@/lib/person";
import {
  THEME_DEPLOY_REQUIRED_MESSAGE,
  themeCommitChoiceFromTask,
  themeDeploysEnabled,
  type ThemeDeploysState,
} from "@/lib/theme-deploy";
import { ThemeDeploySelect } from "@/components/theme-deploy-select";
import {
  TASK_STATUSES,
  TASK_TYPES,
  type ProjectRole,
  type Task,
} from "@/types/database";

export type ProfileOption = {
  id: string;
  email: string;
  full_name: string | null;
  deleted_at?: string | null;
  role?: ProjectRole;
};

export type TaskWithPeople = Task & {
  creator?: ProfileOption | null;
  reporter?: ProfileOption | null;
  assignee?: ProfileOption | null;
};

function displayName(profile?: ProfileOption | null) {
  if (!profile) return "Unassigned";
  return personDisplayName(profile, profile.email || "Someone");
}

function isMobileTaskLayout() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches
  );
}

export function TaskModal({
  mode,
  projectId,
  listId,
  members,
  currentUserId,
  defaultAssigneeId = null,
  task,
  canTrackTime = false,
  isTimeAdmin = false,
  runningEntry = null,
  initialReplyCommentId = null,
  contextLabel = null,
  contextHref = null,
  scheduledWeekdays = [],
  defaultDueDate = null,
  themeDeploys: themeDeploysProp = null,
  onClose,
}: {
  mode: "create" | "edit";
  projectId: string;
  listId: string;
  members: ProfileOption[];
  currentUserId: string;
  defaultAssigneeId?: string | null;
  task?: TaskWithPeople | null;
  canTrackTime?: boolean;
  isTimeAdmin?: boolean;
  runningEntry?: TimeEntryRow | null;
  initialReplyCommentId?: string | null;
  contextLabel?: string | null;
  contextHref?: string | null;
  scheduledWeekdays?: number[];
  defaultDueDate?: string | null;
  themeDeploys?: ThemeDeploysState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [pending, startTransition] = useTransition();
  const [historyKey, setHistoryKey] = useState(0);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(
    () => Boolean(initialReplyCommentId),
  );
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [themeDeploys, setThemeDeploys] = useState<ThemeDeploysState | null>(
    themeDeploysProp,
  );
  const [themeCommit, setThemeCommit] = useState(() =>
    themeCommitChoiceFromTask(task ?? {}),
  );

  function formSnapshot(form: HTMLFormElement) {
    const formData = new FormData(form);
    return JSON.stringify({
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      due_date: String(formData.get("due_date") ?? "").trim(),
      status: String(formData.get("status") ?? "todo"),
      task_type: String(formData.get("task_type") ?? ""),
      reported_by: String(formData.get("reported_by") ?? ""),
      assigned_to: String(formData.get("assigned_to") ?? ""),
      theme_commit: String(formData.get("theme_commit") ?? "").trim(),
    });
  }

  useEffect(() => {
    if (mode !== "edit" || !formRef.current) return;
    lastSavedSnapshotRef.current = formSnapshot(formRef.current);
    setSaveState("idle");
  }, [mode, task?.id]);

  useEffect(() => {
    setCommentCount(null);
    setMobileCommentsOpen(Boolean(initialReplyCommentId));
    setThemeCommit(themeCommitChoiceFromTask(task ?? {}));
  }, [task?.id, initialReplyCommentId]);

  useEffect(() => {
    if (themeDeploysProp) {
      setThemeDeploys(themeDeploysProp);
      return;
    }
    let cancelled = false;
    void listThemeDeploys(projectId).then((result) => {
      if (!cancelled) setThemeDeploys(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, themeDeploysProp]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function persistEdit(options?: { closeAfter?: boolean }) {
    if (mode !== "edit" || !task || !formRef.current) return;
    const form = formRef.current;
    const snapshot = formSnapshot(form);
    const parsed = JSON.parse(snapshot) as { title: string };
    if (!parsed.title) {
      setError("Title is required.");
      setSaveState("error");
      if (options?.closeAfter) onClose();
      return;
    }
    if (snapshot === lastSavedSnapshotRef.current) {
      setError(null);
      setSaveState("idle");
      if (options?.closeAfter) onClose();
      return;
    }

    const formData = new FormData(form);
    const nextStatus = String(formData.get("status") ?? "todo");
    if (
      themeDeploysEnabled(themeDeploys) &&
      nextStatus === "done" &&
      task.status !== "done" &&
      !themeCommit
    ) {
      setError(THEME_DEPLOY_REQUIRED_MESSAGE);
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    startTransition(async () => {
      const result = await updateTask(projectId, listId, task.id, formData);
      if (result?.error) {
        setError(result.error);
        setSaveState("error");
        return;
      }
      lastSavedSnapshotRef.current = snapshot;
      setError(null);
      setSaveState("saved");
      if (!("unchanged" in result && result.unchanged)) {
        setHistoryKey((value) => value + 1);
        router.refresh();
      }
      if (options?.closeAfter) onClose();
    });
  }

  function scheduleEditSave() {
    if (mode !== "edit") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistEdit();
    }, 650);
  }

  function saveEditNow() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    persistEdit();
  }

  function requestClose() {
    if (mode === "edit") {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      persistEdit({ closeAfter: true });
      return;
    }
    onClose();
  }

  const editing = mode === "edit" && !!task;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={requestClose}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (mobileCommentsOpen && isMobileTaskLayout()) {
          setMobileCommentsOpen(false);
          return;
        }
        requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex w-full flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-lg sm:rounded-xl ${
          editing
            ? `max-h-[92dvh] max-w-3xl lg:h-[min(92dvh,56rem)] lg:max-w-6xl lg:overflow-hidden ${
                mobileCommentsOpen ? "h-[92dvh] overflow-hidden" : "overflow-y-auto"
              }`
            : "max-h-[92dvh] max-w-3xl overflow-y-auto"
        }`}
        style={
          editing
            ? undefined
            : { paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[5] shrink-0 bg-[var(--surface)] px-5 pt-5 pb-1 sm:px-6 sm:pt-6 md:px-7 md:pt-7">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-xl tracking-tight">
                {mode === "create" ? "New task" : "Edit task"}
              </h2>
              {mode === "edit" && task ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {task.key ? (
                    <p className="text-sm font-medium tabular-nums tracking-wide text-[var(--muted)]">
                      {task.key}
                    </p>
                  ) : null}
                  <TaskTypeTag taskType={task.task_type} />
                </div>
              ) : null}
              {contextLabel ? (
                contextHref ? (
                  <Link
                    href={contextHref}
                    className="mt-1 block truncate text-sm text-[var(--muted)] hover:text-[var(--accent)]"
                  >
                    {contextLabel}
                  </Link>
                ) : (
                  <p className="mt-1 truncate text-sm text-[var(--muted)]">
                    {contextLabel}
                  </p>
                )
              ) : null}
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="min-h-9 min-w-9 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Close
            </button>
          </div>
          {editing ? (
            <button
              type="button"
              onClick={() => setMobileCommentsOpen(true)}
              aria-expanded={mobileCommentsOpen}
              className="mt-3 flex w-full items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm font-medium hover:bg-[var(--background)] lg:hidden"
            >
              <span>Comments</span>
              <span className="font-normal text-[var(--muted)]">
                {commentCount != null && commentCount > 0
                  ? `${commentCount} · View`
                  : "View"}
              </span>
            </button>
          ) : null}
        </div>

        <div
          className={
            editing
              ? "flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden"
              : ""
          }
        >
          <div
            className={`px-5 pb-5 sm:px-6 sm:pb-6 md:px-7 md:pb-7 ${
              editing ? "min-h-0 lg:flex-1 lg:overflow-y-auto" : ""
            }`}
            style={
              editing
                ? { paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }
                : undefined
            }
          >
            <form
              ref={formRef}
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (mode === "edit") {
                  saveEditNow();
                  return;
                }
                const formData = new FormData(event.currentTarget);
                const nextStatus = String(formData.get("status") ?? "todo");
                if (
                  themeDeploysEnabled(themeDeploys) &&
                  nextStatus === "done" &&
                  !themeCommit
                ) {
                  setError(THEME_DEPLOY_REQUIRED_MESSAGE);
                  return;
                }
                startTransition(async () => {
                  const result = await createTask(projectId, listId, formData);
                  if (result?.error) {
                    setError(result.error);
                  } else {
                    onClose();
                  }
                });
              }}
              onInput={() => {
                if (mode === "edit") scheduleEditSave();
              }}
              onChange={(event) => {
                if (mode !== "edit") return;
                const target = event.target as HTMLElement;
                if (
                  target instanceof HTMLSelectElement ||
                  (target instanceof HTMLInputElement && target.type === "hidden")
                ) {
                  saveEditNow();
                }
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                Title
                <input
                  name="title"
                  required
                  defaultValue={task?.title ?? ""}
                  onBlur={() => {
                    if (mode === "edit") saveEditNow();
                  }}
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                Description
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={task?.description ?? ""}
                  onBlur={() => {
                    if (mode === "edit") saveEditNow();
                  }}
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <DueDatePicker
                  name="due_date"
                  defaultValue={task?.due_date ?? defaultDueDate ?? ""}
                  highlightedWeekdays={scheduledWeekdays}
                  onChange={() => {
                    if (mode === "edit") {
                      requestAnimationFrame(() => saveEditNow());
                    }
                  }}
                />
                <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                  Type
                  <select
                    name="task_type"
                    defaultValue={task?.task_type ?? ""}
                    className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                  >
                    <option value="">No type</option>
                    {TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                {themeDeploysEnabled(themeDeploys) ? (
                  <div className="sm:col-span-2">
                    <ThemeDeploySelect
                      value={themeCommit}
                      commits={themeDeploys.commits}
                      currentSha={task?.theme_commit_sha}
                      currentMessage={task?.theme_commit_message}
                      error={themeDeploys.error}
                      onChange={setThemeCommit}
                    />
                  </div>
                ) : themeDeploys === null ? (
                  <input type="hidden" name="theme_commit" value={themeCommit} />
                ) : (
                  <input type="hidden" name="theme_commit" value="" />
                )}
                <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                  Status
                  <select
                    name="status"
                    defaultValue={task?.status ?? "todo"}
                    className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                  Reporter
                  <select
                    name="reported_by"
                    defaultValue={task?.reported_by ?? currentUserId}
                    className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {displayName(member)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                  Assignee
                  <select
                    name="assigned_to"
                    defaultValue={
                      task?.assigned_to ??
                      (mode === "create" ? (defaultAssigneeId ?? "") : "")
                    }
                    className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {displayName(member)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {mode === "edit" && task ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--muted)]">
                    Created by {displayName(task.creator)}
                  </p>
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
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-[var(--danger)]">{error}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                {mode === "create" ? (
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
                  >
                    {pending ? "Saving…" : "Save task"}
                  </button>
                ) : null}
                {mode === "edit" && task ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await deleteTask(
                          projectId,
                          listId,
                          task.id,
                        );
                        if (result?.error) {
                          setError(result.error);
                        } else {
                          onClose();
                        }
                      });
                    }}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </form>

            {mode === "edit" && task ? (
              <>
                <TaskStatusHistory
                  projectId={projectId}
                  taskId={task.id}
                  refreshKey={historyKey}
                />
                {canTrackTime ? (
                  <TimeTrackingPanel
                    projectId={projectId}
                    listId={listId}
                    taskId={task.id}
                    currentUserId={currentUserId}
                    isAdmin={isTimeAdmin}
                    runningEntry={runningEntry}
                  />
                ) : null}
                <TaskAttachments
                  projectId={projectId}
                  listId={listId}
                  taskId={task.id}
                />
              </>
            ) : null}
          </div>

          {editing && task ? (
            <aside
              className={`min-h-0 flex-col overflow-hidden bg-[var(--surface)] lg:relative lg:flex lg:w-[24rem] lg:border-l lg:border-[var(--border)] lg:bg-[var(--background)]/50 xl:w-[26rem] ${
                mobileCommentsOpen
                  ? "absolute inset-0 z-10 flex rounded-t-2xl sm:rounded-xl lg:rounded-none"
                  : "hidden"
              }`}
              aria-label="Comments"
            >
              <TaskComments
                projectId={projectId}
                listId={listId}
                taskId={task.id}
                currentUserId={currentUserId}
                members={members}
                initialReplyToId={initialReplyCommentId}
                onClose={() => setMobileCommentsOpen(false)}
                onCountChange={setCommentCount}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
