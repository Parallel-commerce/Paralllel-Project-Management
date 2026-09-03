import { WEEKDAYS } from "@/lib/scheduled-weekdays";

export function WeekdayPicker({
  name = "scheduled_weekdays",
  defaultValue = [],
}: {
  name?: string;
  defaultValue?: number[];
}) {
  const selected = new Set(defaultValue);

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm text-[var(--muted)]">Scheduled days</legend>
      <p className="text-xs text-[var(--muted)]">
        Days this project is usually worked on. Those weekdays are highlighted
        when picking a due date.
      </p>
      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => (
          <label
            key={day.value}
            className="cursor-pointer rounded-md border border-[var(--border)] bg-white text-xs font-medium text-[var(--foreground)] outline-none ring-[var(--accent)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:text-[var(--accent)] has-[:focus-visible]:ring-2"
          >
            <input
              type="checkbox"
              name={name}
              value={String(day.value)}
              defaultChecked={selected.has(day.value)}
              className="sr-only"
            />
            <span className="inline-flex min-h-10 min-w-10 items-center justify-center px-2">
              {day.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
