import { requireSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format-date";
import { compareTasksByImportance } from "@/lib/sort-tasks";
import type { ProjectType, TaskStatus } from "@/types/database";

export type NextWorkTask = {
  id: string;
  listId: string;
  key: string | null;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  dueLabel: string | null;
  isInProgress: boolean;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function formatWorkDayLabel(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const day = dueDate.slice(0, 10);
  const today = todayIso();
  const tomorrow = tomorrowIso();
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  if (day < today) return `Overdue · ${formatDate(day)}`;
  return formatDate(day);
}

/** Highest-priority open work: in progress first, otherwise top to-do. */
export function pickNextWorkTask<
  T extends {
    id: string;
    list_id: string;
    key: string | null;
    title: string;
    status: string;
    due_date: string | null;
    importance?: number | null;
    created_at?: string;
  },
>(tasks: T[]): NextWorkTask | null {
  if (tasks.length === 0) return null;

  const inProgress = tasks
    .filter((task) => task.status === "in_progress")
    .sort(compareTasksByImportance);
  const chosen = inProgress[0]
    ?? [...tasks]
      .filter((task) => task.status === "todo")
      .sort(compareTasksByImportance)[0]
    ?? null;

  if (!chosen) return null;

  const dueDate = chosen.due_date?.slice(0, 10) ?? null;
  return {
    id: chosen.id,
    listId: chosen.list_id,
    key: chosen.key,
    title: chosen.title,
    status: chosen.status as TaskStatus,
    dueDate,
    dueLabel: formatWorkDayLabel(dueDate),
    isInProgress: chosen.status === "in_progress",
  };
}

export async function loadProjectPlanType(
  projectId: string,
): Promise<ProjectType | null> {
  const { supabase } = await requireSessionUser();
  const { data } = await supabase.rpc("project_plan_type", {
    p_project_id: projectId,
  });
  return (data as ProjectType | null) ?? null;
}

export async function loadNextWorkTask(
  projectId: string,
): Promise<NextWorkTask | null> {
  const { supabase } = await requireSessionUser();
  const { data } = await supabase
    .from("tasks")
    .select("id, list_id, key, title, status, due_date, importance, created_at")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .in("status", ["todo", "in_progress"]);

  return pickNextWorkTask(data ?? []);
}
