/** UK-stable display dates so SSR HTML matches the browser. */

export function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const day = iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    return iso;
  }
}

export function formatShortDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDayMonth(iso: string) {
  try {
    const day = iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
    }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    return iso;
  }
}

export function dateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  return iso.slice(0, 10);
}
