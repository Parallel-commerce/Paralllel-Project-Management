import type { ProjectType, ScheduleCadence } from "@/types/database";

/** Cadence is fixed by plan. `none` = no retainer day schedule. */
export function cadenceForPlan(
  projectType: ProjectType | null | undefined,
): ScheduleCadence {
  switch (projectType) {
    case "optimise":
      return "fortnightly";
    case "accelerate":
      return "weekly";
    case "growth":
      return "every_3_days";
    default:
      return "none";
  }
}

export function planCadenceLabel(
  projectType: ProjectType | null | undefined,
): string | null {
  switch (cadenceForPlan(projectType)) {
    case "fortnightly":
      return "Every fortnight";
    case "weekly":
      return "Every week";
    case "every_3_days":
      return "Every 3 days";
    case "none":
      return null;
  }
}

export function planHasScheduleCadence(
  projectType: ProjectType | null | undefined,
): boolean {
  return cadenceForPlan(projectType) !== "none";
}
