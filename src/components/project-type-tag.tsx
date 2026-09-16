import { projectTypeColors, projectTypeLabel } from "@/lib/project-type";
import type { ProjectType } from "@/types/database";

export function ProjectTypeTag({
  projectType,
  className = "",
}: {
  projectType: ProjectType | null | undefined;
  className?: string;
}) {
  if (!projectType) return null;
  const colors = projectTypeColors(projectType);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.tag} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`}
        aria-hidden
      />
      {projectTypeLabel(projectType)}
    </span>
  );
}
