import {
  allocateSequentialDueDates,
  hasActiveCadence,
  type ScheduleConfig,
} from "@/lib/allocate-due-dates";
import {
  taskTypeOmitsDueDate,
  taskTypePrefersFirstAvailable,
} from "@/lib/task-type";
import type { TaskStatus, TaskType } from "@/types/database";

export type TodoScheduleRow = {
  id: string;
  status: TaskStatus | string;
  due_date: string | null;
  task_type: TaskType | null;
  due_date_locked: boolean;
  importance?: number | null;
  created_at?: string | null;
};

export type TodoScheduleUpdate = {
  id: string;
  importance: number;
  due_date: string | null;
  due_date_locked: boolean;
};

function dayOf(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "";
}

/** Higher importance first, then older tasks. */
export function compareTodoPriority(a: TodoScheduleRow, b: TodoScheduleRow) {
  const byImportance = (b.importance ?? 0) - (a.importance ?? 0);
  if (byImportance !== 0) return byImportance;
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

/**
 * Dates for a list's to-dos.
 * `orderedTodoIds` is priority order, highest first.
 * Admin-locked dates stay put and occupy that day.
 * Other open tasks (in progress, waiting on feedback) also occupy their days.
 * Unlocked to-dos fill the remaining work days: bugs first, then everyone else
 * in priority order.
 */
export function planTodoDueDates(options: {
  orderedTodoIds: string[];
  tasks: TodoScheduleRow[];
  schedule: ScheduleConfig;
}): TodoScheduleUpdate[] {
  const { orderedTodoIds, tasks, schedule } = options;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const shouldReschedule = hasActiveCadence(schedule.cadence);
  const total = orderedTodoIds.length;
  const occupancy: Record<string, number> = {};

  if (shouldReschedule) {
    for (const row of tasks) {
      if (row.status === "done" || row.status === "todo") continue;
      if (taskTypeOmitsDueDate(row.task_type)) continue;
      const day = dayOf(row.due_date);
      if (!day) continue;
      occupancy[day] = (occupancy[day] ?? 0) + 1;
    }

    for (const id of orderedTodoIds) {
      const row = byId.get(id);
      if (!row?.due_date_locked || taskTypeOmitsDueDate(row.task_type)) continue;
      const day = dayOf(row.due_date);
      if (!day) continue;
      occupancy[day] = (occupancy[day] ?? 0) + 1;
    }
  }

  const unlocked = (id: string) => {
    const row = byId.get(id);
    if (!row || taskTypeOmitsDueDate(row.task_type)) return false;
    if (row.due_date_locked && dayOf(row.due_date)) return false;
    return true;
  };

  const scheduleIds = shouldReschedule
    ? [
        ...orderedTodoIds.filter(
          (id) =>
            unlocked(id) &&
            taskTypePrefersFirstAvailable(byId.get(id)?.task_type),
        ),
        ...orderedTodoIds.filter((id) => {
          if (!unlocked(id)) return false;
          return !taskTypePrefersFirstAvailable(byId.get(id)?.task_type);
        }),
      ]
    : [];

  const datesById = new Map<string, string | null>();
  if (shouldReschedule) {
    const dates = allocateSequentialDueDates(
      schedule,
      scheduleIds.length,
      occupancy,
    );
    scheduleIds.forEach((id, index) => {
      datesById.set(id, dates[index] ?? null);
    });
  }

  return orderedTodoIds.map((id, index) => {
    const existing = byId.get(id);
    const type = existing?.task_type ?? null;
    const lockedDay = dayOf(existing?.due_date);
    const locked =
      !!existing?.due_date_locked && !!lockedDay && !taskTypeOmitsDueDate(type);

    let dueDate: string | null;
    if (taskTypeOmitsDueDate(type)) {
      dueDate = null;
    } else if (locked) {
      dueDate = lockedDay;
    } else if (shouldReschedule) {
      dueDate = datesById.get(id) ?? null;
    } else {
      dueDate = lockedDay || null;
    }

    return {
      id,
      importance: total - index,
      due_date: dueDate,
      due_date_locked: locked,
    };
  });
}
