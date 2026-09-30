/** Higher importance first, then soonest due date, then oldest created. */
export function compareTasksByImportance<
  T extends {
    importance?: number | null;
    due_date?: string | null;
    created_at?: string;
  },
>(a: T, b: T) {
  const aImp = a.importance ?? 0;
  const bImp = b.importance ?? 0;
  if (aImp !== bImp) return bImp - aImp;

  const aDate = a.due_date?.slice(0, 10) ?? "";
  const bDate = b.due_date?.slice(0, 10) ?? "";
  if (!aDate && bDate) return -1;
  if (aDate && !bDate) return 1;
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export function sortTasksByImportance<
  T extends {
    importance?: number | null;
    due_date?: string | null;
    created_at?: string;
  },
>(tasks: T[]) {
  return [...tasks].sort(compareTasksByImportance);
}

/** @deprecated Prefer sortTasksByImportance — kept for call sites that still need due-date-first. */
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
