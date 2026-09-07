"use client";

import { format, parseISO, startOfDay } from "date-fns";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { formatScheduledWeekdays } from "@/lib/scheduled-weekdays";

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
};

export function DueDatePicker({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  label = "Due date",
  placeholder = "Pick a date",
  highlightedWeekdays = [],
}: DueDatePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledValue !== undefined;
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");

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
          />
          {scheduledLabel ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {scheduledLabel} highlighted for this project.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
