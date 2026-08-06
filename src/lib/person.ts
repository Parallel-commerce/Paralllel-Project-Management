/** Shared display helpers for people attributed on tasks, comments, chat, etc. */

export type PersonLike = {
  full_name?: string | null;
  email?: string | null;
  deleted_at?: string | null;
} | null | undefined;

export function personDisplayName(
  person: PersonLike,
  fallback = "Someone",
) {
  if (!person) return fallback;
  const base =
    (person.full_name && person.full_name.trim()) ||
    (person.email && !person.email.endsWith("@removed.invalid")
      ? person.email
      : null) ||
    fallback;
  if (person.deleted_at) {
    return `${base} (removed)`;
  }
  return base;
}
