/** Build a task-key prefix from a project name (first letter of each word). */
export function projectTaskPrefix(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase());

  return parts.length > 0 ? parts.join("") : "T";
}

export function formatTaskKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}
