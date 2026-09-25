"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { useRouter } from "next/navigation";

import { StatusTag } from "@/components/status-tag";
import { updateTaskDueDate, updateTaskStatus } from "@/lib/actions/projects";
import { taskStatusLabel } from "@/lib/task-status";
import { THEME_DEPLOY_REQUIRED_MESSAGE } from "@/lib/theme-deploy";
import { TASK_STATUSES, type TaskStatus } from "@/types/database";

type Menu = "status" | "date" | null;

function formatDue(value: string) {
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM");
  } catch {
    return value;
  }
}

function shiftIso(iso: string, days: number) {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  const next = new Date(year, month - 1, date);
  next.setDate(next.getDate() + days);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function TaskCardQuickActions({
  taskId,
  projectId,
  listId,
  status,
  dueDate,
  todayIso,
  href,
  onOpen,
  onStatusChange,
  onDueDateChange,
  onBeforeStatusChange,
}: {
  taskId: string;
  projectId: string;
  listId: string;
  status: TaskStatus;
  dueDate: string | null;
  todayIso: string;
  href?: string;
  onOpen?: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onDueDateChange: (dueDate: string | null) => void;
  /** Return false to handle the change elsewhere and skip the save. */
  onBeforeStatusChange?: (status: TaskStatus) => boolean;
}) {
  const router = useRouter();
  const statusId = useId();
  const dateId = useId();
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const [menu, setMenu] = useState<Menu>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const overdue = !!dueDate && dueDate.slice(0, 10) < todayIso && status !== "done";
  const dueValue = dueDate?.slice(0, 10) ?? "";
  const selected = dueValue ? parseISO(dueValue) : undefined;

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (statusBtnRef.current?.contains(target)) return;
      if (dateBtnRef.current?.contains(target)) return;
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) return;
    const trigger =
      menu === "status" ? statusBtnRef.current : dateBtnRef.current;
    const panel = menuRef.current;
    if (!trigger || !panel) return;

    function place() {
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gap = 6;
      let top = rect.bottom + gap;
      if (top + panelRect.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - panelRect.height);
      }
      let left = rect.right - panelRect.width;
      left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menu, error, pending, dueValue]);

  function openTask() {
    setMenu(null);
    if (onOpen) {
      onOpen();
      return;
    }
    if (href) router.push(href);
  }

  function toggle(next: Menu) {
    setError(null);
    setMenu((current) => (current === next ? null : next));
  }

  async function changeStatus(next: TaskStatus) {
    if (next === status) {
      setMenu(null);
      return;
    }
    if (onBeforeStatusChange && !onBeforeStatusChange(next)) {
      setMenu(null);
      return;
    }
    const requestId = ++requestRef.current;
    const previous = status;
    onStatusChange(next);
    setError(null);
    setPending(true);
    const result = await updateTaskStatus(projectId, listId, taskId, next);
    if (requestId !== requestRef.current) return;
    setPending(false);
    if (result && "error" in result && result.error) {
      onStatusChange(previous);
      setError(result.error);
      setMenu("status");
      return;
    }
    setMenu(null);
    router.refresh();
  }

  async function changeDueDate(next: string | null) {
    const normalized = next?.slice(0, 10) || null;
    const current = dueDate?.slice(0, 10) || null;
    if (normalized === current) {
      setMenu(null);
      return;
    }
    const requestId = ++requestRef.current;
    onDueDateChange(normalized);
    setError(null);
    setPending(true);
    const result = await updateTaskDueDate(
      projectId,
      listId,
      taskId,
      normalized,
    );
    if (requestId !== requestRef.current) return;
    setPending(false);
    if (result && "error" in result && result.error) {
      onDueDateChange(current);
      setError(result.error);
      setMenu("date");
      return;
    }
    setMenu(null);
    router.refresh();
  }

  const presets = [
    { label: "Today", value: todayIso },
    { label: "Tomorrow", value: shiftIso(todayIso, 1) },
    { label: "Next week", value: shiftIso(todayIso, 7) },
  ];

  const menuPanel =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: 0, left: 0 }}
            className="z-[60] max-h-[min(32rem,calc(100vh-1rem))] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
          >
            {menu === "status" ? (
              <div
                role="menu"
                aria-labelledby={statusId}
                className="flex min-w-44 flex-col"
              >
                {TASK_STATUSES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={status === option.value}
                    disabled={pending}
                    onClick={() => void changeStatus(option.value)}
                    className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-left hover:bg-[var(--surface-2)] disabled:opacity-60"
                  >
                    <StatusTag status={option.value} />
                    {status === option.value ? (
                      <span className="text-[11px] text-[var(--muted)]">
                        Current
                      </span>
                    ) : null}
                  </button>
                ))}
                {error ? (
                  <div className="mt-1 border-t border-[var(--border)] px-1.5 pt-2">
                    <p className="text-xs text-[var(--danger)]">{error}</p>
                    {error === THEME_DEPLOY_REQUIRED_MESSAGE &&
                    (onOpen || href) ? (
                      <button
                        type="button"
                        onClick={openTask}
                        className="mt-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        Open task
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div role="dialog" aria-labelledby={dateId}>
                <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                  {presets.map((preset) => {
                    const active = dueValue === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={pending}
                        onClick={() => void changeDueDate(preset.value)}
                        className={`rounded-md border px-2 py-1 text-xs disabled:opacity-60 ${
                          active
                            ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  {dueValue ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void changeDueDate(null)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-2)] disabled:opacity-60"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className={pending ? "pointer-events-none opacity-60" : ""}>
                  <DayPicker
                    mode="single"
                    weekStartsOn={1}
                    selected={selected}
                    defaultMonth={selected ?? new Date()}
                    onSelect={(date) => {
                      if (!date) {
                        void changeDueDate(null);
                        return;
                      }
                      void changeDueDate(format(date, "yyyy-MM-dd"));
                    }}
                  />
                </div>
                {error ? (
                  <p className="px-2 pb-1 text-xs text-[var(--danger)]">{error}</p>
                ) : null}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={statusBtnRef}
        id={statusId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu === "status"}
        aria-busy={pending && menu === "status"}
        title="Change status"
        aria-label={`Change status, currently ${taskStatusLabel(status)}`}
        onClick={() => toggle("status")}
        className={`rounded-md outline-none ring-[var(--accent)] hover:bg-black/5 focus-visible:ring-2 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <StatusTag status={status} />
      </button>
      <button
        ref={dateBtnRef}
        id={dateId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menu === "date"}
        aria-label={dueDate ? `Change due date, ${formatDue(dueDate)}` : "Set due date"}
        title="Change due date"
        onClick={() => toggle("date")}
        className={`rounded px-1 py-0.5 text-xs tabular-nums outline-none ring-[var(--accent)] hover:bg-black/5 focus-visible:ring-2 ${
          pending ? "opacity-60" : ""
        } ${overdue ? "font-medium text-[var(--danger)]" : "text-[var(--muted)]"}`}
      >
        {dueDate ? formatDue(dueDate) : "No date"}
      </button>
      {menuPanel}
    </>
  );
}
