"use client";

import { planCadenceLabel, planHasScheduleCadence } from "@/lib/plan-cadence";
import { planChangeAllowanceLabel } from "@/lib/plan-changes";
import { PROJECT_TYPES, type ProjectType } from "@/types/database";
import { useState } from "react";

export function ProjectEngagementFields({
  projectType,
  scheduleAnchorDate,
}: {
  projectType?: ProjectType | null;
  scheduleAnchorDate?: string | null;
}) {
  const [selectedType, setSelectedType] = useState<string>(projectType ?? "");
  const plan = (selectedType || null) as ProjectType | null;
  const allowance = planChangeAllowanceLabel(plan);
  const cadenceLabel = planCadenceLabel(plan);
  const showAnchor = planHasScheduleCadence(plan);
  const defaultAnchor =
    scheduleAnchorDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Plan
        <select
          name="project_type"
          value={selectedType}
          onChange={(event) => setSelectedType(event.target.value)}
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
          {[allowance, cadenceLabel ? `Cadence: ${cadenceLabel}` : "No cadence"]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </label>
      {showAnchor ? (
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Schedule anchor date
          <input
            name="schedule_anchor_date"
            type="date"
            defaultValue={defaultAnchor}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
          <span className="text-xs text-[var(--muted)]">
            Starting point for the plan’s cadence cycle.
          </span>
        </label>
      ) : (
        <input type="hidden" name="schedule_anchor_date" value={defaultAnchor} />
      )}
    </div>
  );
}
