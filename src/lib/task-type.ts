import type { TaskType } from "@/types/database";
import { TASK_TYPES } from "@/types/database";

export function taskTypeLabel(type: TaskType | null | undefined) {
  if (!type) return "";
  return TASK_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function parseTaskType(raw: string): TaskType | null {
  const value = raw.trim();
  if (!value) return null;
  return TASK_TYPES.some((item) => item.value === value)
    ? (value as TaskType)
    : null;
}

export function taskTypeColors(type: TaskType) {
  switch (type) {
    case "bug":
      return {
        accent: "bg-[var(--type-bug-border)]",
        tag: "bg-[var(--type-bug-bg)] text-[var(--type-bug-label)] ring-[var(--type-bug-border)]/25",
      };
    case "new_feature":
      return {
        accent: "bg-[var(--type-feature-border)]",
        tag: "bg-[var(--type-feature-bg)] text-[var(--type-feature-label)] ring-[var(--type-feature-border)]/25",
      };
    case "improvement":
      return {
        accent: "bg-[var(--type-improvement-border)]",
        tag: "bg-[var(--type-improvement-bg)] text-[var(--type-improvement-label)] ring-[var(--type-improvement-border)]/25",
      };
    case "data":
      return {
        accent: "bg-[var(--type-data-border)]",
        tag: "bg-[var(--type-data-bg)] text-[var(--type-data-label)] ring-[var(--type-data-border)]/25",
      };
    case "documentation":
      return {
        accent: "bg-[var(--type-docs-border)]",
        tag: "bg-[var(--type-docs-bg)] text-[var(--type-docs-label)] ring-[var(--type-docs-border)]/25",
      };
    case "design":
      return {
        accent: "bg-[var(--type-design-border)]",
        tag: "bg-[var(--type-design-bg)] text-[var(--type-design-label)] ring-[var(--type-design-border)]/25",
      };
    case "research":
      return {
        accent: "bg-[var(--type-research-border)]",
        tag: "bg-[var(--type-research-bg)] text-[var(--type-research-label)] ring-[var(--type-research-border)]/25",
      };
    case "maintenance":
      return {
        accent: "bg-[var(--type-maintenance-border)]",
        tag: "bg-[var(--type-maintenance-bg)] text-[var(--type-maintenance-label)] ring-[var(--type-maintenance-border)]/25",
      };
    case "other":
      return {
        accent: "bg-[var(--type-other-border)]",
        tag: "bg-[var(--type-other-bg)] text-[var(--type-other-label)] ring-[var(--type-other-border)]/25",
      };
  }
}
