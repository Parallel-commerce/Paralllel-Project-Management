export const VERTICAL_NAME_MAX = 60;

export type VerticalOption = {
  id: string;
  name: string;
};

export function parseVerticalName(
  raw: string,
): string | null | { error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return null;
  if (name.length > VERTICAL_NAME_MAX) {
    return {
      error: `Vertical names can be at most ${VERTICAL_NAME_MAX} characters.`,
    };
  }
  return name;
}

export function verticalNamesEqual(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function asVertical(value: unknown): VerticalOption | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { id?: unknown; name?: unknown };
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  return { id: record.id, name: record.name };
}

export function verticalsFromJoin(
  rows:
    | Array<{
        verticals?: unknown;
        vertical?: unknown;
      }>
    | null
    | undefined,
): VerticalOption[] {
  if (!rows) return [];
  const seen = new Set<string>();
  const out: VerticalOption[] = [];
  for (const row of rows) {
    const raw = row.verticals ?? row.vertical;
    const items = !raw ? [] : Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      const vertical = asVertical(item);
      if (!vertical || seen.has(vertical.id)) continue;
      seen.add(vertical.id);
      out.push(vertical);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function verticalsByCompanyId(
  rows:
    | Array<{
        company_id: string;
        verticals?: unknown;
        vertical?: unknown;
      }>
    | null
    | undefined,
): Map<string, VerticalOption[]> {
  const grouped = new Map<string, Array<{ verticals?: unknown; vertical?: unknown }>>();
  for (const row of rows ?? []) {
    const list = grouped.get(row.company_id) ?? [];
    list.push(row);
    grouped.set(row.company_id, list);
  }
  const out = new Map<string, VerticalOption[]>();
  for (const [companyId, list] of grouped) {
    out.set(companyId, verticalsFromJoin(list));
  }
  return out;
}
