export const TASK_IMPORTANCE_LEVELS = [
  { value: 0, label: "Normal" },
  { value: 25, label: "High" },
  { value: 50, label: "Urgent" },
  { value: 75, label: "Critical" },
] as const;

export function parseImportance(raw: string): number | { error: string } {
  const value = raw.trim();
  if (!value) return 0;
  if (!/^-?\d+$/.test(value)) {
    return { error: "Importance must be a whole number." };
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000) {
    return { error: "Importance must be a whole number of 0 or more." };
  }
  return n;
}

export function importanceLabel(value: number | null | undefined): string {
  if (value == null || value <= 0) return "Normal";
  const exact = TASK_IMPORTANCE_LEVELS.find((level) => level.value === value);
  if (exact) return exact.label;
  if (value >= 75) return "Critical";
  if (value >= 50) return "Urgent";
  if (value >= 25) return "High";
  return "Normal";
}

/** Nearest preset for selects when the stored value isn’t exact. */
export function nearestImportanceLevel(value: number | null | undefined): number {
  if (value == null) return 0;
  let best: number = TASK_IMPORTANCE_LEVELS[0].value;
  let bestDist = Math.abs(value - best);
  for (const level of TASK_IMPORTANCE_LEVELS) {
    const dist = Math.abs(value - level.value);
    if (dist < bestDist) {
      best = level.value;
      bestDist = dist;
    }
  }
  return best;
}
