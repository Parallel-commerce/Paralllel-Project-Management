"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useMemo, useState } from "react";

import { TaskTypeTag } from "@/components/task-type-tag";
import { taskStatusColors } from "@/lib/task-status";
import type { TaskStatus, TaskType } from "@/types/database";

export type CalendarTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  task_type?: TaskType | null;
  projectName?: string;
  listName?: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_STARTS_ON = 1 as const;

function statusDot(status: TaskStatus) {
  return taskStatusColors(status).accent;
}

function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function contextLabel(task: CalendarTask) {
  if (task.projectName && task.listName) {
    return `${task.projectName} · ${task.listName}`;
  }
  return task.projectName || task.listName || null;
}

export function MyWorkCalendar({
  tasks,
  todayIso,
  selectedDay,
  onSelectDay,
  onOpenTask,
  showContext = true,
  highlightedWeekdays = [],
}: {
  tasks: CalendarTask[];
  todayIso: string;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  onOpenTask: (taskId: string) => void;
  showContext?: boolean;
  /** 0 = Sunday … 6 = Saturday */
  highlightedWeekdays?: number[];
}) {
  const [month, setMonth] = useState(() => {
    const seed = selectedDay || todayIso;
    try {
      return startOfMonth(parseISO(seed));
    } catch {
      return startOfMonth(new Date());
    }
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), {
      weekStartsOn: WEEK_STARTS_ON,
    });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of tasks) {
      if (!task.due_date) continue;
      const key = task.due_date.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);

  const selectedTasks = selectedDay ? (tasksByDay.get(selectedDay) ?? []) : [];
  const scheduledSet = useMemo(
    () => new Set(highlightedWeekdays),
    [highlightedWeekdays],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg tracking-tight">
          {format(month, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMonth((current) => addMonths(current, -1))}
            className="min-h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm hover:bg-[var(--surface-2)]"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(parseISO(todayIso)))}
            className="min-h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm hover:bg-[var(--surface-2)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonth((current) => addMonths(current, 1))}
            className="min-h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm hover:bg-[var(--surface-2)]"
          >
            Next
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
          {WEEKDAYS.map((day, index) => {
            const weekday = index === 6 ? 0 : index + 1;
            const scheduled = scheduledSet.has(weekday);
            return (
              <div
                key={day}
                className={`px-1 py-2 text-center text-[11px] font-medium uppercase tracking-wide sm:text-xs ${
                  scheduled
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const key = dayKey(date);
            const inMonth = isSameMonth(date, month);
            const isToday = key === todayIso;
            const isSelected = key === selectedDay;
            const isScheduled = scheduledSet.has(date.getDay());
            const dayTasks = tasksByDay.get(key) ?? [];
            const visible = dayTasks.slice(0, 3);
            const extra = dayTasks.length - visible.length;
            const overdueCount = dayTasks.filter(
              (task) =>
                task.due_date &&
                task.due_date < todayIso &&
                task.status !== "done",
            ).length;

            return (
              <div
                key={key}
                className={`min-h-[4.5rem] border-t border-l border-[var(--border)] p-1 sm:min-h-[7.5rem] sm:p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0 ${
                  isScheduled && inMonth
                    ? "bg-[var(--accent-soft)]/80"
                    : inMonth
                      ? "bg-[var(--surface)]"
                      : "bg-[var(--background)]/70"
                } ${isSelected ? "ring-2 ring-inset ring-[var(--ink)]" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectDay(key)}
                  className="flex w-full items-center justify-between gap-1 rounded-md px-0.5 text-left"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                      isToday
                        ? "bg-[var(--ink)] font-medium text-white"
                        : inMonth
                          ? "text-[var(--foreground)]"
                          : "text-[var(--muted)]"
                    }`}
                  >
                    {format(date, "d")}
                  </span>
                  {dayTasks.length > 0 ? (
                    <span
                      className={`text-[10px] tabular-nums sm:hidden ${
                        overdueCount > 0
                          ? "font-medium text-[var(--danger)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {dayTasks.length}
                    </span>
                  ) : null}
                </button>

                <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                  {visible.map((task) => {
                    const overdue =
                      !!task.due_date &&
                      task.due_date < todayIso &&
                      task.status !== "done";
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-white/80 ${
                          overdue
                            ? "text-[var(--danger)]"
                            : "text-[var(--foreground)]"
                        }`}
                        title={task.title}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(task.status)}`}
                        />
                        <span className="min-w-0 truncate">{task.title}</span>
                      </button>
                    );
                  })}
                  {extra > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSelectDay(key)}
                      className="px-1 text-left text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      +{extra} more
                    </button>
                  ) : null}
                </div>

                <div className="mt-1 flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                  {dayTasks.slice(0, 4).map((task) => (
                    <span
                      key={task.id}
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${statusDot(task.status)}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <section className="sm:hidden">
          <h3 className="text-sm font-medium">
            {format(parseISO(selectedDay), "EEEE d MMM")}
          </h3>
          {selectedTasks.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Nothing due on this day.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {selectedTasks.map((task) => {
                const context = showContext ? contextLabel(task) : null;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      className="flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left"
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDot(task.status)}`}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">
                            {task.title}
                          </span>
                          <TaskTypeTag taskType={task.task_type} />
                        </span>
                        {context ? (
                          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                            {context}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {selectedDay && selectedTasks.length > 0 ? (
        <section className="hidden sm:block">
          <h3 className="text-sm font-medium">
            {format(parseISO(selectedDay), "EEEE d MMMM")}
            <span className="ml-2 font-normal text-[var(--muted)]">
              {selectedTasks.length}
            </span>
          </h3>
          <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {selectedTasks.map((task) => {
              const context = showContext ? contextLabel(task) : null;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${statusDot(task.status)}`}
                      />
                      <span className="min-w-0 truncate font-medium">{task.title}</span>
                      <TaskTypeTag taskType={task.task_type} className="shrink-0" />
                    </span>
                    {context ? (
                      <span className="shrink-0 truncate text-xs text-[var(--muted)]">
                        {context}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
