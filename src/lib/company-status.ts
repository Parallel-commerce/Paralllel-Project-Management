import type { CompanyStatus } from "@/types/database";
import { COMPANY_STATUSES } from "@/types/database";

export function companyStatusLabel(status: CompanyStatus | null | undefined) {
  if (!status) return "—";
  return COMPANY_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function companyStatusColors(status: CompanyStatus) {
  switch (status) {
    case "lead":
      return {
        accent: "bg-[var(--status-todo-border)]",
        tag: "bg-[var(--status-todo-bg)] text-[var(--status-todo-label)] ring-[var(--status-todo-border)]/25",
      };
    case "contacted":
      return {
        accent: "bg-[var(--status-progress-border)]",
        tag: "bg-[var(--status-progress-bg)] text-[var(--status-progress-label)] ring-[var(--status-progress-border)]/25",
      };
    case "proposal":
      return {
        accent: "bg-[var(--status-feedback-border)]",
        tag: "bg-[var(--status-feedback-bg)] text-[var(--status-feedback-label)] ring-[var(--status-feedback-border)]/25",
      };
    case "won":
      return {
        accent: "bg-[var(--status-done-border)]",
        tag: "bg-[var(--status-done-bg)] text-[var(--status-done-label)] ring-[var(--status-done-border)]/25",
      };
    case "lost":
      return {
        accent: "bg-[var(--muted)]",
        tag: "bg-[var(--surface-2)] text-[var(--muted)] ring-[var(--border)]",
      };
  }
}
