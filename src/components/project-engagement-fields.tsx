import { PROJECT_TYPES, type ProjectType } from "@/types/database";

export function ProjectEngagementFields({
  projectType,
  monthlyHours,
}: {
  projectType?: ProjectType | null;
  monthlyHours?: number | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Project type
        <select
          name="project_type"
          defaultValue={projectType ?? ""}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        >
          <option value="">Not set</option>
          {PROJECT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--muted)]">
          What this client is currently engaged with. Only visible to Parallel.
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Hours per month
        <input
          name="monthly_hours"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={monthlyHours ?? ""}
          placeholder="e.g. 8"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
        <span className="text-xs text-[var(--muted)]">
          Retainer hours this client gets each month. Only visible to Parallel.
        </span>
      </label>
    </div>
  );
}
