"use client";

import { format, parseISO, startOfDay } from "date-fns";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DayPicker,
  labelDayButton,
  type DayButtonProps,
} from "react-day-picker";
import "react-day-picker/style.css";

import { getProjectDueDateCounts } from "@/lib/actions/projects";
import { formatScheduledWeekdays } from "@/lib/scheduled-weekdays";

const OccupancyCountsContext = createContext<Record<string, number>>({});

type DueDatePickerProps = {
  name?: string;
  label?: string;
  /** Uncontrolled default (forms) */
  defaultValue?: string | null;
  /** Controlled value (filters) — YYYY-MM-DD or "" */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** 0 = Sunday … 6 = Saturday */
  highlightedWeekdays?: number[];
  /** When set, each day shows how many open tasks are already due. */
  projectId?: string | null;
  /** Don't count the task currently being edited. */
  excludeTaskId?: string | null;
};

function occupancyCopy(count: number) {
  if (count <= 0) return "";
  return `${count} open ${count === 1 ? "task" : "tasks"} already due`;
}

function OccupancyMeter({ count }: { count: number }) {
  if (count <= 0) {
    return <span className="rdp-load" data-level={0} aria-hidden />;
  }
  const level = Math.min(count, 4);
  return (
    <span className="rdp-load" data-level={level} aria-hidden>
      {count > 3 ? (
        <span className="rdp-load-count">{count > 9 ? "9+" : count}</span>
      ) : (
        Array.from({ length: count }, (_, index) => (
          <span key={index} className="rdp-load-dot" data-on="true" />
        ))
      )}
    </span>
  );
}

function OccupancyDayButton({
  day,
  modifiers,
  children,
  ...buttonProps
}: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const counts = useContext(OccupancyCountsContext);
  const count = counts[day.isoDate] ?? 0;
  const level = Math.min(count, 4);
  const loadLabel = occupancyCopy(count);

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      {...buttonProps}
      ref={ref}
      data-load={level}
      title={loadLabel || buttonProps.title}
    >
      {children}
      <OccupancyMeter count={count} />
    </button>
  );
}

export function DueDatePicker({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  label = "Due date",
  placeholder = "Pick a date",
  highlightedWeekdays = [],
  projectId = null,
  excludeTaskId = null,
}: DueDatePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledValue !== undefined;
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const value = isControlled ? (controlledValue ?? "") : internalValue;

  useEffect(() => {
    if (!isControlled) {
      setInternalValue(defaultValue ?? "");
    }
  }, [defaultValue, isControlled]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open || !projectId) {
      return;
    }
    let cancelled = false;
    void getProjectDueDateCounts(projectId, excludeTaskId).then((result) => {
      if (!cancelled) setCounts(result.counts);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, excludeTaskId]);

  function setValue(next: string) {
    if (!isControlled) {
      setInternalValue(next);
    }
    onChange?.(next);
  }

  const selected = value ? parseISO(value) : undefined;
  const scheduledLabel = formatScheduledWeekdays(highlightedWeekdays);
  const today = useMemo(() => startOfDay(new Date()), []);
  const modifiers = useMemo(() => {
    const next: {
      past: { before: Date };
      scheduled?: { dayOfWeek: number[] };
    } = { past: { before: today } };
    if (highlightedWeekdays.length > 0) {
      next.scheduled = { dayOfWeek: highlightedWeekdays };
    }
    return next;
  }, [highlightedWeekdays, today]);

  return (
    <div
      ref={rootRef}
      className="relative flex flex-col gap-1.5 text-sm text-[var(--muted)]"
    >
      {label ? <label htmlFor={id}>{label}</label> : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="flex gap-2">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        >
          {value ? format(parseISO(value), "d MMM yyyy") : placeholder}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setOpen(false);
            }}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-2)]"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
          <OccupancyCountsContext.Provider value={counts}>
            <DayPicker
              mode="single"
              weekStartsOn={1}
              selected={selected}
              onSelect={(date) => {
                if (!date) {
                  setValue("");
                  return;
                }
                setValue(format(date, "yyyy-MM-dd"));
                setOpen(false);
              }}
              defaultMonth={selected ?? new Date()}
              modifiers={modifiers}
              modifiersClassNames={{
                past: "rdp-past",
                scheduled: "rdp-scheduled",
              }}
              components={
                projectId ? { DayButton: OccupancyDayButton } : undefined
              }
              labels={{
                labelDayButton: (date, dayModifiers, options, dateLib) => {
                  const base = labelDayButton(
                    date,
                    dayModifiers,
                    options,
                    dateLib,
                  );
                  const count = counts[format(date, "yyyy-MM-dd")] ?? 0;
                  const loadLabel = occupancyCopy(count);
                  return loadLabel ? `${base}, ${loadLabel}` : base;
                },
              }}
            />
          </OccupancyCountsContext.Provider>
          {scheduledLabel ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {scheduledLabel} highlighted. Dots = open tasks on this project.
            </p>
          ) : projectId ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Dots = open tasks already due on this project.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
