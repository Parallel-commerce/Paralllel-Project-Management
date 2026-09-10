import type { CompanyKind } from "@/types/database";
import { COMPANY_KINDS } from "@/types/database";

export function companyKindLabel(kind: CompanyKind | null | undefined) {
  if (!kind) return "—";
  return COMPANY_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export function companyKindColors(kind: CompanyKind) {
  switch (kind) {
    case "prospect":
      return {
        accent: "bg-[var(--status-todo-border)]",
        tag: "bg-[var(--status-todo-bg)] text-[var(--status-todo-label)] ring-[var(--status-todo-border)]/25",
      };
    case "lost_opportunity":
      return {
        accent: "bg-[var(--muted)]",
        tag: "bg-[var(--surface-2)] text-[var(--muted)] ring-[var(--border)]",
      };
    case "customer":
      return {
        accent: "bg-[var(--status-done-border)]",
        tag: "bg-[var(--status-done-bg)] text-[var(--status-done-label)] ring-[var(--status-done-border)]/25",
      };
    case "ex_customer":
      return {
        accent: "bg-[var(--status-progress-border)]",
        tag: "bg-[var(--status-progress-bg)] text-[var(--status-progress-label)] ring-[var(--status-progress-border)]/25",
      };
    case "agency":
      return {
        accent: "bg-[var(--status-feedback-border)]",
        tag: "bg-[var(--status-feedback-bg)] text-[var(--status-feedback-label)] ring-[var(--status-feedback-border)]/25",
      };
  }
}
