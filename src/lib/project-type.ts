import type { ProjectEngagement, ProjectType } from "@/types/database";
import { PROJECT_TYPES } from "@/types/database";

export type ProjectEngagementFields = {
  projectType: ProjectType | null;
  monthlyHours: number | null;
};

export function projectTypeLabel(type: ProjectType | null | undefined) {
  if (!type) return "";
  return PROJECT_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function parseProjectType(raw: string): ProjectType | null {
  const value = raw.trim();
  if (!value) return null;
  return PROJECT_TYPES.some((item) => item.value === value)
    ? (value as ProjectType)
    : null;
}

export function parseMonthlyHours(
  raw: string,
): { hours: number | null } | { error: string } {
  const value = raw.trim();
  if (!value) return { hours: null };
  if (!/^\d+$/.test(value)) {
    return { error: "Hours per month must be a whole number of 0 or more." };
  }
  const hours = Number(value);
  if (!Number.isSafeInteger(hours) || hours < 0 || hours > 10_000) {
    return { error: "Hours per month must be a whole number of 0 or more." };
  }
  return { hours };
}

export function parseProjectEngagement(
  formData: FormData,
): ProjectEngagementFields | { error: string } {
  const typeRaw = String(formData.get("project_type") ?? "").trim();
  if (typeRaw && !PROJECT_TYPES.some((item) => item.value === typeRaw)) {
    return { error: "Choose a valid project type." };
  }

  const hoursResult = parseMonthlyHours(
    String(formData.get("monthly_hours") ?? ""),
  );
  if ("error" in hoursResult) return hoursResult;

  return {
    projectType: parseProjectType(typeRaw),
    monthlyHours: hoursResult.hours,
  };
}

export function projectEngagementFromRow(
  row:
    | Pick<ProjectEngagement, "project_type" | "monthly_hours">
    | Pick<ProjectEngagement, "project_type" | "monthly_hours">[]
    | null
    | undefined,
): ProjectEngagementFields {
  const engagement = Array.isArray(row) ? row[0] : row;
  return {
    projectType: engagement?.project_type ?? null,
    monthlyHours: engagement?.monthly_hours ?? null,
  };
}

export function projectEngagementSummary(
  projectType: ProjectType | null | undefined,
  monthlyHours: number | null | undefined,
) {
  const parts = [
    projectTypeLabel(projectType) || null,
    monthlyHours == null ? null : `${monthlyHours}h/mo`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function projectTypeColors(type: ProjectType) {
  switch (type) {
    case "new_website":
      return {
        accent: "bg-[var(--type-feature-border)]",
        tag: "bg-[var(--type-feature-bg)] text-[var(--type-feature-label)] ring-[var(--type-feature-border)]/25",
      };
    case "maintain":
      return {
        accent: "bg-[var(--type-maintenance-border)]",
        tag: "bg-[var(--type-maintenance-bg)] text-[var(--type-maintenance-label)] ring-[var(--type-maintenance-border)]/25",
      };
    case "optimise":
      return {
        accent: "bg-[var(--type-improvement-border)]",
        tag: "bg-[var(--type-improvement-bg)] text-[var(--type-improvement-label)] ring-[var(--type-improvement-border)]/25",
      };
    case "accelerate":
      return {
        accent: "bg-[var(--type-research-border)]",
        tag: "bg-[var(--type-research-bg)] text-[var(--type-research-label)] ring-[var(--type-research-border)]/25",
      };
    case "enterprise_b2b":
      return {
        accent: "bg-[var(--type-data-border)]",
        tag: "bg-[var(--type-data-bg)] text-[var(--type-data-label)] ring-[var(--type-data-border)]/25",
      };
  }
}
