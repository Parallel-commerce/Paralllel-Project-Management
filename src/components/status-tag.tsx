import { taskStatusColors, taskStatusLabel } from "@/lib/task-status";
import type { TaskStatus } from "@/types/database";

export function StatusTag({
  status,
  className = "",
}: {
  status: TaskStatus;
  className?: string;
}) {
  const colors = taskStatusColors(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.tag} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`}
        aria-hidden
      />
      {taskStatusLabel(status)}
    </span>
  );
}

/** Compact count chip for project/list overview rows. */
export function StatusCountTag({
  status,
  count,
}: {
  status: TaskStatus;
  count: number;
}) {
  if (count <= 0) return null;
  const colors = taskStatusColors(status);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${colors.tag}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`}
        aria-hidden
      />
      {count} {taskStatusLabel(status).toLowerCase()}
    </span>
  );
}
