import type { TaskStatus } from "@/types/database";
import { TASK_STATUSES } from "@/types/database";

export function taskStatusLabel(status: TaskStatus | null | undefined) {
  if (!status) return "—";
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function taskStatusColors(status: TaskStatus) {
  switch (status) {
    case "todo":
      return {
        bg: "bg-[var(--status-todo-bg)]",
        border: "border-[var(--status-todo-border)]/35",
        accent: "bg-[var(--status-todo-border)]",
        label: "text-[var(--status-todo-label)]",
        tag: "bg-[var(--status-todo-bg)] text-[var(--status-todo-label)] ring-[var(--status-todo-border)]/25",
      };
    case "in_progress":
      return {
        bg: "bg-[var(--status-progress-bg)]",
        border: "border-[var(--status-progress-border)]/35",
        accent: "bg-[var(--status-progress-border)]",
        label: "text-[var(--status-progress-label)]",
        tag: "bg-[var(--status-progress-bg)] text-[var(--status-progress-label)] ring-[var(--status-progress-border)]/25",
      };
    case "requiring_feedback":
      return {
        bg: "bg-[var(--status-feedback-bg)]",
        border: "border-[var(--status-feedback-border)]/30",
        accent: "bg-[var(--status-feedback-border)]",
        label: "text-[var(--status-feedback-label)]",
        tag: "bg-[var(--status-feedback-bg)] text-[var(--status-feedback-label)] ring-[var(--status-feedback-border)]/25",
      };
    case "done":
      return {
        bg: "bg-[var(--status-done-bg)]",
        border: "border-[var(--status-done-border)]/35",
        accent: "bg-[var(--status-done-border)]",
        label: "text-[var(--status-done-label)]",
        tag: "bg-[var(--status-done-bg)] text-[var(--status-done-label)] ring-[var(--status-done-border)]/25",
      };
  }
}
