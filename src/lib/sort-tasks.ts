/** No due date first, then soonest date, then oldest created. */
export function compareTasksByDueDate<
  T extends { due_date?: string | null; created_at?: string },
>(a: T, b: T) {
  const aDate = a.due_date?.slice(0, 10) ?? "";
  const bDate = b.due_date?.slice(0, 10) ?? "";
  if (!aDate && bDate) return -1;
  if (aDate && !bDate) return 1;
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export function sortTasksByDueDate<
  T extends { due_date?: string | null; created_at?: string },
>(tasks: T[]) {
  return [...tasks].sort(compareTasksByDueDate);
}
