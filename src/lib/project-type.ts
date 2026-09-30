import { cadenceForPlan, planCadenceLabel } from "@/lib/plan-cadence";
import type {
  ProjectEngagement,
  ProjectType,
  ScheduleCadence,
} from "@/types/database";
import { PROJECT_TYPES } from "@/types/database";

export type ProjectEngagementFields = {
  projectType: ProjectType | null;
  scheduleCadence: ScheduleCadence;
  scheduleAnchorDate: string;
};

export function projectTypeLabel(type: ProjectType | null | undefined) {
  if (!type) return "";
  if (type === "enterprise_b2b") return "Enterprise & B2B";
  return PROJECT_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function parseProjectType(raw: string): ProjectType | null {
  const value = raw.trim();
  if (!value) return null;
  return PROJECT_TYPES.some((item) => item.value === value)
    ? (value as ProjectType)
    : null;
}

export function parseScheduleAnchorDate(
  raw: string,
): { date: string } | { error: string } {
  const value = raw.trim();
  if (!value) {
    return { date: new Date().toISOString().slice(0, 10) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: "Anchor date must be YYYY-MM-DD." };
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Anchor date must be a valid date." };
  }
  return { date: value };
}

export function parseProjectEngagement(
  formData: FormData,
): ProjectEngagementFields | { error: string } {
  const typeRaw = String(formData.get("project_type") ?? "").trim();
  if (typeRaw && !PROJECT_TYPES.some((item) => item.value === typeRaw)) {
    return { error: "Choose a valid plan." };
  }

  const projectType = parseProjectType(typeRaw);
  const scheduleCadence = cadenceForPlan(projectType);

  const anchorResult = parseScheduleAnchorDate(
    String(formData.get("schedule_anchor_date") ?? ""),
  );
  if ("error" in anchorResult) return anchorResult;

  return {
    projectType,
    scheduleCadence,
    scheduleAnchorDate: anchorResult.date,
  };
}

export function projectEngagementFromRow(
  row:
    | Partial<
        Pick<
          ProjectEngagement,
          "project_type" | "schedule_cadence" | "schedule_anchor_date"
        >
      >
    | Partial<
        Pick<
          ProjectEngagement,
          "project_type" | "schedule_cadence" | "schedule_anchor_date"
        >
      >[]
    | null
    | undefined,
): ProjectEngagementFields {
  const engagement = Array.isArray(row) ? row[0] : row;
  const projectType = engagement?.project_type ?? null;
  return {
    projectType,
    scheduleCadence: cadenceForPlan(projectType),
    scheduleAnchorDate:
      engagement?.schedule_anchor_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  };
}

export function projectEngagementSummary(
  projectType: ProjectType | null | undefined,
  _scheduleCadence?: ScheduleCadence | null,
) {
  const parts = [
    projectTypeLabel(projectType) || null,
    planCadenceLabel(projectType),
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
    case "growth":
      return {
        accent: "bg-[var(--type-design-border)]",
        tag: "bg-[var(--type-design-bg)] text-[var(--type-design-label)] ring-[var(--type-design-border)]/25",
      };
    case "enterprise_b2b":
      return {
        accent: "bg-[var(--type-data-border)]",
        tag: "bg-[var(--type-data-bg)] text-[var(--type-data-label)] ring-[var(--type-data-border)]/25",
      };
  }
}
