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

/** Questions are never scheduled and never require a due date. */
export function taskTypeOmitsDueDate(type: TaskType | null | undefined) {
  return type === "question";
}

/** Bugs take the first free scheduled work day when no date is set. */
export function taskTypePrefersFirstAvailable(
  type: TaskType | null | undefined,
) {
  return type === "bug";
}

export function taskTypeHint(type: TaskType | null | undefined) {
  switch (type) {
    case "bug":
      return "Goes on the first free work day.";
    case "question":
      return "No due date — we’ll answer when we can.";
    case "new_feature":
      return "New work for the store. Scheduled from the priority order.";
    case "improvement":
      return "An upgrade to something that already exists. Scheduled from priority.";
    case "shopify_admin":
      return "Admin / settings work in Shopify. Scheduled from priority.";
    default:
      return "Optional. Choosing a type helps us schedule it correctly.";
  }
}

export function taskTypeColors(type: TaskType) {
  switch (type) {
    case "bug":
      return {
        accent: "bg-[var(--type-bug-border)]",
        tag: "bg-[var(--type-bug-bg)] text-[var(--type-bug-label)] ring-[var(--type-bug-border)]/25",
      };
    case "question":
      return {
        accent: "bg-[var(--type-question-border)]",
        tag: "bg-[var(--type-question-bg)] text-[var(--type-question-label)] ring-[var(--type-question-border)]/25",
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
    case "shopify_admin":
      return {
        accent: "bg-[var(--type-shopify-border)]",
        tag: "bg-[var(--type-shopify-bg)] text-[var(--type-shopify-label)] ring-[var(--type-shopify-border)]/25",
      };
  }
}
