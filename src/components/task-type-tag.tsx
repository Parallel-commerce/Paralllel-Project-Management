import { taskTypeColors, taskTypeLabel } from "@/lib/task-type";
import type { TaskType } from "@/types/database";

export function TaskTypeTag({
  taskType,
  className = "",
}: {
  taskType: TaskType | null | undefined;
  className?: string;
}) {
  if (!taskType) return null;
  const colors = taskTypeColors(taskType);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.tag} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`}
        aria-hidden
      />
      {taskTypeLabel(taskType)}
    </span>
  );
}
