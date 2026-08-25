"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { companyStatusLabel } from "@/lib/company-status";
import type { TaskStatus } from "@/types/database";

export type SearchHit = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  status?: TaskStatus;
  archived?: boolean;
};

export type SearchResults = {
  query: string;
  projects: SearchHit[];
  lists: SearchHit[];
  tasks: SearchHit[];
  companies: SearchHit[];
  contacts: SearchHit[];
  error?: string;
};

const LIMIT = 8;

function sanitizeQuery(raw: string) {
  return raw
    .replace(/[^\p{L}\p{N}\s.#+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function ilikePattern(query: string) {
  return `%${query}%`;
}

function orIlike(columns: string[], query: string) {
  const value = `"%${query}%"`;
  return columns.map((column) => `${column}.ilike.${value}`).join(",");
}

function nestedName(value: unknown, fallback: string) {
  if (!value) return fallback;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return fallback;
  const name = (row as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name : fallback;
}

function matchScore(query: string, ...fields: Array<string | null | undefined>) {
  const q = query.toLowerCase();
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const value = field.toLowerCase();
    if (value === q) best = Math.max(best, 100);
    else if (value.startsWith(q)) best = Math.max(best, 80);
    else if (value.includes(` ${q}`)) best = Math.max(best, 60);
    else if (value.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

function sortHits<T extends { score: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.score - a.score).slice(0, LIMIT);
}

function toSearchHit(row: SearchHit & { score: number }): SearchHit {
  return {
    id: row.id,
    href: row.href,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status,
    archived: row.archived,
  };
}

const emptyResults = (query: string): SearchResults => ({
  query,
  projects: [],
  lists: [],
  tasks: [],
  companies: [],
  contacts: [],
});

export async function searchApp(rawQuery: string): Promise<SearchResults> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const trimmed = rawQuery.trim();
  const query = sanitizeQuery(trimmed);
  if (query.length < 1) {
    return emptyResults(trimmed);
  }

  const pattern = ilikePattern(query);

  const { data: isInternal } = await supabase.rpc("is_internal_user");

  const [projectResult, listResult, taskResult, companyResult, contactResult] =
    await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, updated_at")
      .or(orIlike(["name", "description"], query))
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("lists")
      .select("id, name, project_id, updated_at, projects(name)")
      .ilike("name", pattern)
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("tasks")
      .select(
        "id, key, title, status, list_id, project_id, archived_at, updated_at, projects(name), lists(name)",
      )
      .or(orIlike(["title", "key", "description"], query))
      .order("updated_at", { ascending: false })
      .limit(16),
    isInternal
      ? supabase
          .from("companies")
          .select("id, name, website, status, updated_at")
          .or(orIlike(["name", "website", "notes"], query))
          .order("updated_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    isInternal
      ? supabase
          .from("contacts")
          .select("id, full_name, email, title, company_id, companies(name)")
          .or(orIlike(["full_name", "email", "phone", "title"], query))
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error =
    projectResult.error?.message ||
    listResult.error?.message ||
    taskResult.error?.message ||
    companyResult.error?.message ||
    contactResult.error?.message;
  if (error) {
    console.error("searchApp failed", projectResult.error, listResult.error, taskResult.error, companyResult.error, contactResult.error);
    return { ...emptyResults(trimmed), error: "Search failed. Try again." };
  }

  const projects = sortHits(
    (projectResult.data ?? []).map((project) => ({
      id: project.id,
      href: `/projects/${project.id}`,
      title: project.name,
      subtitle: (project.description ?? "").trim(),
      score: matchScore(query, project.name, project.description),
    })),
  ).map(toSearchHit);

  const lists = sortHits(
    (listResult.data ?? []).map((list) => {
      const projectName = nestedName(list.projects, "Project");
      return {
        id: list.id,
        href: `/projects/${list.project_id}/lists/${list.id}`,
        title: list.name,
        subtitle: projectName,
        score: matchScore(query, list.name, projectName),
      };
    }),
  ).map(toSearchHit);

  const tasks = sortHits(
    (taskResult.data ?? []).map((task) => {
      const projectName = nestedName(task.projects, "Project");
      const listName = nestedName(task.lists, "List");
      const archived = !!task.archived_at;
      const href = archived
        ? `/projects/${task.project_id}/lists/${task.list_id}/archive`
        : `/projects/${task.project_id}/lists/${task.list_id}?task=${task.id}`;
      const parts = [task.key, projectName, listName].filter(Boolean);
      return {
        id: task.id,
        href,
        title: task.title,
        subtitle: parts.join(" · "),
        status: task.status as TaskStatus,
        archived,
        score: matchScore(query, task.key, task.title) + (archived ? 0 : 4),
      };
    }),
  ).map(toSearchHit);

  const companies = sortHits(
    (companyResult.data ?? []).map((company) => ({
      id: company.id,
      href: `/crm/${company.id}`,
      title: company.name,
      subtitle: [companyStatusLabel(company.status), company.website]
        .filter(Boolean)
        .join(" · "),
      score: matchScore(query, company.name, company.website),
    })),
  ).map(toSearchHit);

  const contacts = sortHits(
    (contactResult.data ?? []).map((contact) => {
      const companyName = nestedName(contact.companies, "Company");
      return {
        id: contact.id,
        href: `/crm/${contact.company_id}`,
        title: contact.full_name,
        subtitle: [companyName, contact.title, contact.email]
          .filter(Boolean)
          .join(" · "),
        score: matchScore(
          query,
          contact.full_name,
          contact.email,
          contact.title,
          companyName,
        ),
      };
    }),
  ).map(toSearchHit);

  return { query: trimmed, projects, lists, tasks, companies, contacts };
}
