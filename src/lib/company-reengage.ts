import {
  COMPANY_REENGAGES,
  type CompanyReengage,
} from "@/types/database";

export const COMPANY_REENGAGE_OPTIONS = [
  { value: "", label: "Not set" },
  ...COMPANY_REENGAGES,
] as const;

export type CompanyReengageFormValue =
  (typeof COMPANY_REENGAGE_OPTIONS)[number]["value"];

export function companyReengageValue(
  canReengage: CompanyReengage | null | undefined,
): CompanyReengageFormValue {
  return canReengage ?? "";
}

export function companyReengageLabel(
  canReengage: CompanyReengage | null | undefined,
) {
  if (!canReengage) return "Not set";
  return (
    COMPANY_REENGAGES.find((item) => item.value === canReengage)?.label ??
    canReengage
  );
}

export function companyReengageColors(
  canReengage: CompanyReengage | null | undefined,
) {
  switch (canReengage) {
    case "yes":
      return {
        accent: "bg-[var(--status-done-border)]",
        tag: "bg-[var(--status-done-bg)] text-[var(--status-done-label)] ring-[var(--status-done-border)]/25",
      };
    case "no":
      return {
        accent: "bg-[var(--muted)]",
        tag: "bg-[var(--surface-2)] text-[var(--muted)] ring-[var(--border)]",
      };
    case "not_applicable":
      return {
        accent: "bg-[var(--status-todo-border)]",
        tag: "bg-[var(--status-todo-bg)] text-[var(--status-todo-label)] ring-[var(--status-todo-border)]/25",
      };
    default:
      return {
        accent: "bg-[var(--border)]",
        tag: "bg-[var(--surface)] text-[var(--muted)] ring-[var(--border)]",
      };
  }
}
