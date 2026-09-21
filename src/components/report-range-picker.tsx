"use client";

import { format, parseISO, startOfDay } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

import { resolveReportWindow, type ReportPreset } from "@/lib/reports";

const PRESETS: { value: ReportPreset; label: string; hint: string }[] = [
  { value: "last_week", label: "Last week", hint: "Previous full week, Monday to Sunday" },
  {
    value: "week_before_last",
    label: "Week before last",
    hint: "The full week before last week",
  },
  { value: "last_month", label: "Last month", hint: "Previous calendar month" },
  {
    value: "month_before_last",
    label: "Month before last",
    hint: "The calendar month before last month",
  },
  { value: "custom", label: "Custom range", hint: "Pick a start and end date" },
];

export type ReportRangeValue = {
  preset: ReportPreset;
  start: string;
  end: string;
};

export function ReportRangePicker({
  value,
  onChange,
}: {
  value: ReportRangeValue;
  onChange: (value: ReportRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const lastWeek = resolveReportWindow({ preset: "last_week" });
  const weekBeforeLast = resolveReportWindow({ preset: "week_before_last" });
  const lastMonth = resolveReportWindow({ preset: "last_month" });
  const monthBeforeLast = resolveReportWindow({ preset: "month_before_last" });
  const lastWeekLabel = "error" in lastWeek ? "Previous full week" : lastWeek.label;
  const weekBeforeLastLabel =
    "error" in weekBeforeLast ? "The week before last week" : weekBeforeLast.label;
  const lastMonthLabel = "error" in lastMonth ? "Previous calendar month" : lastMonth.label;
  const monthBeforeLastLabel =
    "error" in monthBeforeLast
      ? "The month before last month"
      : monthBeforeLast.label;

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

  const selectedRange: DateRange | undefined =
    value.start && value.end
      ? { from: parseISO(value.start), to: parseISO(value.end) }
      : value.start
        ? { from: parseISO(value.start), to: undefined }
        : undefined;

  const customLabel =
    value.start && value.end
      ? `${format(parseISO(value.start), "d MMM yyyy")} – ${format(parseISO(value.end), "d MMM yyyy")}`
      : value.start
        ? `${format(parseISO(value.start), "d MMM yyyy")} – …`
        : "Pick a date range";

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        {PRESETS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${
              option.value === "custom" ? "sm:col-span-2" : ""
            } ${
              value.preset === option.value
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--border)] bg-white"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name="preset"
                value={option.value}
                checked={value.preset === option.value}
                onChange={() =>
                  onChange({
                    ...value,
                    preset: option.value,
                  })
                }
              />
              {option.label}
            </span>
            <span className="mt-1 pl-5 text-xs text-[var(--muted)]">
              {option.value === "last_week"
                ? lastWeekLabel
                : option.value === "week_before_last"
                  ? weekBeforeLastLabel
                  : option.value === "last_month"
                    ? lastMonthLabel
                    : option.value === "month_before_last"
                      ? monthBeforeLastLabel
                      : option.hint}
            </span>
          </label>
        ))}
      </fieldset>

      {value.preset === "custom" ? (
        <div className="relative" ref={rootRef}>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          >
            {customLabel}
          </button>
          {open ? (
            <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
              <DayPicker
                mode="range"
                weekStartsOn={1}
                selected={selectedRange}
                disabled={{ after: today }}
                onSelect={(range) => {
                  const start = range?.from
                    ? format(range.from, "yyyy-MM-dd")
                    : "";
                  const end = range?.to ? format(range.to, "yyyy-MM-dd") : "";
                  onChange({
                    preset: "custom",
                    start,
                    end,
                  });
                  if (start && end && start !== end) setOpen(false);
                }}
                defaultMonth={selectedRange?.from ?? new Date()}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
