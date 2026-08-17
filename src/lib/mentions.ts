import { personDisplayName } from "@/lib/person";

export type MentionPerson = {
  id: string;
  email: string;
  full_name: string | null;
  deleted_at?: string | null;
};

export type MentionToken =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; personId: string };

export function mentionLabel(person: MentionPerson) {
  return personDisplayName(person, person.email.split("@")[0] || "Someone");
}

export function mentionQueryMatches(person: MentionPerson, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = mentionLabel(person).toLowerCase();
  const email = person.email.toLowerCase();
  return name.includes(q) || email.includes(q);
}

export function findActiveMention(
  value: string,
  cursor: number,
): { start: number; query: string } | null {
  const untilCursor = value.slice(0, cursor);
  const at = untilCursor.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(untilCursor[at - 1] ?? "")) return null;
  const query = untilCursor.slice(at + 1);
  if (query.includes("\n") || query.includes("@")) return null;
  return { start: at, query };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionAliases(person: MentionPerson) {
  const label = mentionLabel(person);
  const aliases = [label];
  const first = label.trim().split(/\s+/)[0];
  if (first && first !== label) aliases.push(first);
  const local = person.email.split("@")[0]?.trim();
  if (local && local.toLowerCase() !== label.toLowerCase()) {
    aliases.push(local);
  }
  return [...new Set(aliases.filter(Boolean))];
}

function uniqueAliasMap(people: MentionPerson[]) {
  const counts = new Map<string, number>();
  for (const person of people) {
    const seen = new Set<string>();
    for (const alias of mentionAliases(person)) {
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const unique = new Map<string, MentionPerson>();
  for (const person of people) {
    const seen = new Set<string>();
    for (const alias of mentionAliases(person)) {
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if ((counts.get(key) ?? 0) === 1) {
        unique.set(key, person);
      }
    }
  }
  return unique;
}

export function tokenizeMentions(
  body: string,
  people: MentionPerson[],
): MentionToken[] {
  const unique = uniqueAliasMap(people);
  const aliases = [...unique.keys()].sort((a, b) => b.length - a.length);
  if (aliases.length === 0) {
    return [{ type: "text", value: body }];
  }

  const pattern = new RegExp(
    `@(?:${aliases.map(escapeRegExp).join("|")})(?=$|[\\s.,!?;:])`,
    "gi",
  );
  const tokens: MentionToken[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    const person = unique.get(match[0].slice(1).toLowerCase());
    if (start > lastIndex) {
      tokens.push({ type: "text", value: body.slice(lastIndex, start) });
    }
    if (person) {
      tokens.push({
        type: "mention",
        value: match[0],
        personId: person.id,
      });
    } else {
      tokens.push({ type: "text", value: match[0] });
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < body.length) {
    tokens.push({ type: "text", value: body.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: body }];
}

export function resolveMentionedUserIds(
  body: string,
  people: MentionPerson[],
  selectedIds: string[] = [],
) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const found = new Set<string>();

  for (const token of tokenizeMentions(body, people)) {
    if (token.type === "mention") found.add(token.personId);
  }

  for (const id of selectedIds) {
    const person = byId.get(id);
    if (!person) continue;
    const label = mentionLabel(person);
    const stillPresent = new RegExp(
      `@${escapeRegExp(label)}(?=$|[\\s.,!?;:])`,
      "i",
    ).test(body);
    if (stillPresent) found.add(id);
  }

  return [...found];
}
