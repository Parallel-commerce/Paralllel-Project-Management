import type { ProjectType } from "@/types/database";

/** Included change requests per calendar month. `null` = unlimited. */
export function monthlyChangeLimit(
  projectType: ProjectType | null | undefined,
): number | null {
  switch (projectType) {
    case "maintain":
      return 0;
    case "optimise":
      return 2;
    case "accelerate":
      return 4;
    case "growth":
      return null;
    default:
      return null;
  }
}

export function planChangeAllowanceLabel(
  projectType: ProjectType | null | undefined,
): string | null {
  if (!projectType) return null;
  const limit = monthlyChangeLimit(projectType);
  if (limit === null) {
    if (projectType === "growth" || projectType === "new_website") {
      return "Unlimited changes";
    }
    return null;
  }
  if (limit === 0) {
    return "Access, reporting & questions — changes billed by time";
  }
  return `${limit} change${limit === 1 ? "" : "s"} included per month`;
}
