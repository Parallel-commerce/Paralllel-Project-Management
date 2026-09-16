"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { enrichCompanyRecord } from "@/lib/ai/claude-company-enrich";
import { getIsInternalUser, requireCrmUser } from "@/lib/auth";
import { inviteMember } from "@/lib/actions/projects";
import { parseCompanyImportCsv, type ImportRowError } from "@/lib/crm-csv";
import {
  normalizeCompanyLinkedInUrl,
  normalizePersonLinkedInUrl,
} from "@/lib/linkedin";
import { parseProjectEngagement } from "@/lib/project-type";
import { parseScheduledWeekdays } from "@/lib/scheduled-weekdays";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  parseVerticalName,
  verticalNamesEqual,
  type VerticalOption,
} from "@/lib/verticals";
import {
  COMPANY_KINDS,
  COMPANY_STATUSES,
  type CompanyKind,
  type CompanyReengage,
  type CompanyStatus,
  type Database,
} from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const IMPORT_MAX_ROWS = 5000;

const STATUS_VALUES = new Set<CompanyStatus>(
  COMPANY_STATUSES.map((item) => item.value),
);

const KIND_VALUES = new Set<CompanyKind>(
  COMPANY_KINDS.map((item) => item.value),
);

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeWebsite(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function parseStatus(raw: string): CompanyStatus | { error: string } {
  if (!STATUS_VALUES.has(raw as CompanyStatus)) {
    return { error: "Choose a valid status." };
  }
  return raw as CompanyStatus;
}

function parseKind(raw: string): CompanyKind | { error: string } {
  if (!KIND_VALUES.has(raw as CompanyKind)) {
    return { error: "Choose a valid type." };
  }
  return raw as CompanyKind;
}

function parseCanReengage(
  raw: string,
): CompanyReengage | null | { error: string } {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s./-]+/g, "_");
  if (!value) return null;
  if (value === "yes" || value === "true" || value === "1" || value === "y") {
    return "yes";
  }
  if (value === "no" || value === "false" || value === "0" || value === "n") {
    return "no";
  }
  if (
    value === "not_applicable" ||
    value === "n_a" ||
    value === "na"
  ) {
    return "not_applicable";
  }
  return { error: "Choose yes, no, or not applicable for re-engage." };
}

function parseDate(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: "Follow-up date is invalid." } as const;
  }
  return value;
}

function parseEmail(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { error: "Enter a valid email address." } as const;
  }
  return value;
}

function parseCompanyLinkedIn(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const normalized = normalizeCompanyLinkedInUrl(value);
  if (!normalized) {
    return { error: "Enter a LinkedIn company page URL." } as const;
  }
  return normalized;
}

function parsePersonLinkedIn(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const normalized = normalizePersonLinkedInUrl(value);
  if (!normalized) {
    return { error: "Enter a LinkedIn profile URL." } as const;
  }
  return normalized;
}

type CrmClient = SupabaseClient<Database>;

async function findOrCreateVertical(
  supabase: CrmClient,
  name: string,
  cache?: VerticalOption[],
): Promise<VerticalOption | { error: string }> {
  if (cache) {
    const cached = cache.find((item) => verticalNamesEqual(item.name, name));
    if (cached) return cached;
  } else {
    const { data: existing, error: existingError } = await supabase
      .from("verticals")
      .select("id, name")
      .order("name", { ascending: true });

    if (existingError) {
      return { error: existingError.message };
    }

    const match = (existing ?? []).find((item) =>
      verticalNamesEqual(item.name, name),
    );
    if (match) return match;
  }

  const { data: created, error } = await supabase
    .from("verticals")
    .insert({ name })
    .select("id, name")
    .single();

  if (!error && created) {
    cache?.push(created);
    return created;
  }
  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("verticals")
      .select("id, name")
      .order("name", { ascending: true });
    const found = (raced ?? []).find((item) =>
      verticalNamesEqual(item.name, name),
    );
    if (found) {
      if (cache && !cache.some((item) => item.id === found.id)) {
        cache.push(found);
      }
      return found;
    }
  }
  return { error: error?.message ?? "Could not save that vertical." };
}

async function attachCompanyVerticals(
  supabase: CrmClient,
  companyId: string,
  names: string[],
  cache?: VerticalOption[],
): Promise<{ error: string } | void> {
  const unique: string[] = [];
  for (const raw of names) {
    const parsed = parseVerticalName(raw);
    if (parsed && typeof parsed === "object") return parsed;
    if (!parsed) continue;
    if (!unique.some((name) => verticalNamesEqual(name, parsed))) {
      unique.push(parsed);
    }
  }
  if (unique.length === 0) return;

  const ids: string[] = [];
  for (const name of unique) {
    const vertical = await findOrCreateVertical(supabase, name, cache);
    if ("error" in vertical) return vertical;
    ids.push(vertical.id);
  }

  const { error } = await supabase.from("company_verticals").insert(
    ids.map((verticalId) => ({
      company_id: companyId,
      vertical_id: verticalId,
    })),
  );
  if (error && error.code !== "23505") {
    return { error: error.message };
  }
}

async function replaceCompanyVerticals(
  supabase: CrmClient,
  companyId: string,
  names: string[],
  cache?: VerticalOption[],
): Promise<{ error: string } | void> {
  const { error } = await supabase
    .from("company_verticals")
    .delete()
    .eq("company_id", companyId);
  if (error) return { error: error.message };
  return attachCompanyVerticals(supabase, companyId, names, cache);
}

export async function createCompany(
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase, user } = await requireCrmUser();
  const name = String(formData.get("name") ?? "").trim();
  const website = normalizeWebsite(String(formData.get("website") ?? ""));
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const statusResult = parseStatus(String(formData.get("status") ?? "lead"));
  if (typeof statusResult === "object") return statusResult;
  const kindResult = parseKind(String(formData.get("kind") ?? "prospect"));
  if (typeof kindResult === "object") return kindResult;
  const followUp = parseDate(String(formData.get("follow_up_at") ?? ""));
  if (followUp && typeof followUp === "object") return followUp;
  const followUpNote = emptyToNull(String(formData.get("follow_up_note") ?? ""));

  if (!name) {
    return { error: "Company name is required." };
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name,
      website,
      notes,
      status: statusResult,
      kind: kindResult,
      follow_up_at: followUp,
      follow_up_note: followUpNote,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create company." };
  }

  const verticals = await attachCompanyVerticals(
    supabase,
    data.id,
    formData.getAll("vertical").map((value) => String(value)),
  );
  if (verticals && "error" in verticals) return verticals;

  revalidatePath("/crm");
  redirect(`/crm/${data.id}`);
}

export async function updateCompany(
  companyId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const name = String(formData.get("name") ?? "").trim();
  const website = normalizeWebsite(String(formData.get("website") ?? ""));
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const statusResult = parseStatus(String(formData.get("status") ?? "lead"));
  if (typeof statusResult === "object") return statusResult;
  const kindResult = parseKind(String(formData.get("kind") ?? "prospect"));
  if (typeof kindResult === "object") return kindResult;
  const canReengage = parseCanReengage(String(formData.get("can_reengage") ?? ""));
  if (canReengage && typeof canReengage === "object") return canReengage;
  const followUp = parseDate(String(formData.get("follow_up_at") ?? ""));
  if (followUp && typeof followUp === "object") return followUp;
  const followUpNote = emptyToNull(String(formData.get("follow_up_note") ?? ""));

  if (!name) {
    return { error: "Company name is required." };
  }

  const { error } = await supabase
    .from("companies")
    .update({
      name,
      website,
      notes,
      status: statusResult,
      kind: kindResult,
      can_reengage: canReengage,
      follow_up_at: followUp,
      follow_up_note: followUpNote,
    })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
}

export async function updateCompanyLookup(
  companyId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const summary = emptyToNull(String(formData.get("summary") ?? ""));
  const linkedinResult = parseCompanyLinkedIn(
    String(formData.get("linkedin_url") ?? ""),
  );
  if (linkedinResult && typeof linkedinResult === "object") return linkedinResult;

  const { error } = await supabase
    .from("companies")
    .update({
      summary,
      linkedin_url: linkedinResult,
    })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
}

export async function updateCompanyKind(
  companyId: string,
  kind: string,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const kindResult = parseKind(kind);
  if (typeof kindResult === "object") return kindResult;

  const { error } = await supabase
    .from("companies")
    .update({ kind: kindResult })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
}

export async function updateCompanyStatus(
  companyId: string,
  status: string,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const statusResult = parseStatus(status);
  if (typeof statusResult === "object") return statusResult;

  const { error } = await supabase
    .from("companies")
    .update({ status: statusResult })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
}

export async function updateCompanyReengage(
  companyId: string,
  canReengage: string,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const parsed = parseCanReengage(canReengage);
  if (parsed && typeof parsed === "object") return parsed;

  const { error } = await supabase
    .from("companies")
    .update({ can_reengage: parsed })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
}

export async function addCompanyVertical(
  companyId: string,
  input: { id?: string; name: string },
): Promise<{ error: string } | VerticalOption> {
  const { supabase } = await requireCrmUser();
  const parsed = parseVerticalName(input.name);
  if (!parsed) {
    return { error: "Enter a vertical name." };
  }
  if (typeof parsed === "object") return parsed;

  let vertical: VerticalOption;
  if (input.id) {
    const { data, error } = await supabase
      .from("verticals")
      .select("id, name")
      .eq("id", input.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "That vertical is no longer available." };
    vertical = data;
  } else {
    const created = await findOrCreateVertical(supabase, parsed);
    if ("error" in created) return created;
    vertical = created;
  }

  const { error } = await supabase.from("company_verticals").insert({
    company_id: companyId,
    vertical_id: vertical.id,
  });
  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
  return vertical;
}

export async function removeCompanyVertical(
  companyId: string,
  verticalId: string,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const { error } = await supabase
    .from("company_verticals")
    .delete()
    .eq("company_id", companyId)
    .eq("vertical_id", verticalId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
}

export type EnrichCompanyResult =
  | { error: string }
  | {
      ok: true;
      companyLinkedIn: boolean;
      contactsLinkedIn: number;
    };

export async function enrichCompany(
  companyId: string,
): Promise<EnrichCompanyResult> {
  const { supabase } = await requireCrmUser();

  const [{ data: company, error: companyError }, { data: contacts, error: contactsError }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, website, notes, linkedin_url")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("id, full_name, title, email, linkedin_url")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("full_name", { ascending: true }),
    ]);

  if (companyError || !company) {
    return { error: companyError?.message ?? "Company not found." };
  }
  if (contactsError) {
    return { error: contactsError.message };
  }

  const contactRows = contacts ?? [];
  const result = await enrichCompanyRecord({
    name: company.name,
    website: company.website,
    notes: company.notes,
    contacts: contactRows.map((contact) => ({
      id: contact.id,
      full_name: contact.full_name,
      title: contact.title,
      email: contact.email,
    })),
  });

  if ("error" in result) {
    return result;
  }

  const companyLinkedIn = result.linkedin_url ?? company.linkedin_url;
  const { error: updateError } = await supabase
    .from("companies")
    .update({
      summary: result.summary,
      linkedin_url: companyLinkedIn,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  if (updateError) {
    return { error: updateError.message };
  }

  let contactsLinkedIn = 0;
  const foundById = new Map(
    result.contacts.map((contact) => [contact.id, contact.linkedin_url]),
  );
  for (const contact of contactRows) {
    const found = foundById.get(contact.id) ?? null;
    if (!found) continue;
    if (contact.linkedin_url === found) continue;
    const { error } = await supabase
      .from("contacts")
      .update({ linkedin_url: found })
      .eq("id", contact.id)
      .eq("company_id", companyId);
    if (error) {
      return { error: error.message };
    }
    contactsLinkedIn += 1;
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
  return {
    ok: true,
    companyLinkedIn: Boolean(result.linkedin_url),
    contactsLinkedIn,
  };
}

export async function deleteCompany(
  companyId: string,
  options?: { redirect?: boolean },
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();

  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  if (options?.redirect !== false) {
    redirect("/crm");
  }
}

export async function createContact(
  companyId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailResult = parseEmail(String(formData.get("email") ?? ""));
  if (emailResult && typeof emailResult === "object") return emailResult;
  const phone = emptyToNull(String(formData.get("phone") ?? ""));
  const title = emptyToNull(String(formData.get("title") ?? ""));
  const linkedinResult = parsePersonLinkedIn(
    String(formData.get("linkedin_url") ?? ""),
  );
  if (linkedinResult && typeof linkedinResult === "object") return linkedinResult;
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const isPrimary = String(formData.get("is_primary") ?? "") === "1";

  if (!fullName) {
    return { error: "Contact name is required." };
  }

  const { error } = await supabase.from("contacts").insert({
    company_id: companyId,
    full_name: fullName,
    email: emailResult,
    phone,
    title,
    linkedin_url: linkedinResult,
    notes,
    is_primary: isPrimary,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/crm/${companyId}`);
  revalidatePath("/crm");
}

export async function updateContact(
  companyId: string,
  contactId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailResult = parseEmail(String(formData.get("email") ?? ""));
  if (emailResult && typeof emailResult === "object") return emailResult;
  const phone = emptyToNull(String(formData.get("phone") ?? ""));
  const title = emptyToNull(String(formData.get("title") ?? ""));
  const linkedinResult = parsePersonLinkedIn(
    String(formData.get("linkedin_url") ?? ""),
  );
  if (linkedinResult && typeof linkedinResult === "object") return linkedinResult;
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const isPrimary = String(formData.get("is_primary") ?? "") === "1";

  if (!fullName) {
    return { error: "Contact name is required." };
  }

  const { error } = await supabase
    .from("contacts")
    .update({
      full_name: fullName,
      email: emailResult,
      phone,
      title,
      linkedin_url: linkedinResult,
      notes,
      is_primary: isPrimary,
    })
    .eq("id", contactId)
    .eq("company_id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/crm/${companyId}`);
}

export async function deleteContact(
  companyId: string,
  contactId: string,
): Promise<{ error: string } | void> {
  const { supabase } = await requireCrmUser();

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("company_id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/crm/${companyId}`);
  revalidatePath("/crm");
}

export async function convertCompanyToProject(
  companyId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase, user } = await requireCrmUser();
  const canCreateProjects = await getIsInternalUser();
  if (!canCreateProjects) {
    return {
      error:
        "Only Parallel team members can convert a company into a project.",
    };
  }
  const name = String(formData.get("name") ?? "").trim();
  const description = emptyToNull(String(formData.get("description") ?? ""));
  const scheduledWeekdays = parseScheduledWeekdays(formData);
  const engagement = parseProjectEngagement(formData);
  const inviteIds = formData
    .getAll("invite_contact_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!name) {
    return { error: "Project name is required." };
  }
  if ("error" in engagement) {
    return { error: engagement.error };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, status, kind")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError || !company) {
    return { error: companyError?.message ?? "Company not found." };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name,
      description,
      scheduled_weekdays: scheduledWeekdays,
      created_by: user.id,
      company_id: companyId,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return { error: projectError?.message ?? "Could not create project." };
  }

  const { error: memberError } = await supabase.from("project_members").upsert(
    {
      project_id: project.id,
      user_id: user.id,
      role: "admin",
    },
    { onConflict: "project_id,user_id" },
  );

  if (memberError) {
    return {
      error: `Project created but membership failed: ${memberError.message}`,
    };
  }

  const { error: engagementError } = await supabase
    .from("project_engagement")
    .upsert(
      {
        project_id: project.id,
        project_type: engagement.projectType,
        monthly_hours: engagement.monthlyHours,
      },
      { onConflict: "project_id" },
    );

  if (engagementError) {
    return {
      error: `Project created but engagement details could not be saved: ${engagementError.message}`,
    };
  }

  if (company.status !== "won" || company.kind !== "customer") {
    await supabase
      .from("companies")
      .update({ status: "won", kind: "customer" })
      .eq("id", companyId);
  }

  if (inviteIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, email")
      .eq("company_id", companyId)
      .in("id", inviteIds);

    for (const contact of contacts ?? []) {
      const email = (contact.email ?? "").trim().toLowerCase();
      if (!email) continue;
      const inviteData = new FormData();
      inviteData.set("email", email);
      inviteData.set("role", "client");
      await inviteMember(project.id, inviteData);
    }
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${companyId}`);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export type ImportCompaniesResult = {
  companiesCreated: number;
  companiesMatched: number;
  companiesUpdated: number;
  contactsCreated: number;
  contactsUpdated: number;
  contactsSkipped: number;
  verticalsAssigned: number;
  warning?: string;
  errors: ImportRowError[];
  error?: string;
};

function emptyImportResult(
  extra: Partial<ImportCompaniesResult> = {},
): ImportCompaniesResult {
  return {
    companiesCreated: 0,
    companiesMatched: 0,
    companiesUpdated: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsSkipped: 0,
    verticalsAssigned: 0,
    errors: [],
    ...extra,
  };
}

export async function importCompanies(
  formData: FormData,
): Promise<ImportCompaniesResult> {
  const { supabase, user } = await requireCrmUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return emptyImportResult({ error: "Choose a CSV file to import." });
  }

  if (file.size > IMPORT_MAX_BYTES) {
    return emptyImportResult({ error: "CSV must be 2MB or smaller." });
  }

  const text = await file.text();
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
  if (lineCount - 1 > IMPORT_MAX_ROWS) {
    return emptyImportResult({
      error: `CSV can have at most ${IMPORT_MAX_ROWS} data rows.`,
    });
  }

  const parsed = parseCompanyImportCsv(text);
  if ("error" in parsed) {
    return emptyImportResult({ error: parsed.error });
  }

  const { companies, errors, hasVerticalsColumn } = parsed;
  const companiesWithVerticals = companies.filter(
    (company) => company.verticals.length > 0,
  ).length;
  const warning =
    hasVerticalsColumn && companiesWithVerticals === 0
      ? "The verticals, summary, and LinkedIn columns were empty, so those fields were left unchanged. Put values in the verticals column and import again."
      : hasVerticalsColumn && companiesWithVerticals < companies.length
        ? `Verticals were found for ${companiesWithVerticals} of ${companies.length} companies. Fill the verticals column for the rest and import again.`
        : undefined;

  if (companies.length === 0) {
    return emptyImportResult({
      errors,
      error: errors[0]?.message ?? "No companies found in the CSV.",
    });
  }

  const existingResult = await fetchAllRows<{ id: string; name: string }>(
    (from, to) =>
      supabase
        .from("companies")
        .select("id, name")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (existingResult.error) {
    return emptyImportResult({ errors, error: existingResult.error });
  }

  const existingById = new Map(
    existingResult.data.map((row) => [row.id, row]),
  );
  const existingByName = new Map(
    existingResult.data.map((row) => [row.name.trim().toLowerCase(), row.id]),
  );

  const verticalsCacheResult = await fetchAllRows<VerticalOption>((from, to) =>
    supabase
      .from("verticals")
      .select("id, name")
      .order("name", { ascending: true })
      .range(from, to),
  );
  if (verticalsCacheResult.error) {
    return emptyImportResult({ errors, error: verticalsCacheResult.error });
  }
  const verticalsCache = verticalsCacheResult.data;

  let companiesCreated = 0;
  let companiesMatched = 0;
  let companiesUpdated = 0;
  let verticalsAssigned = 0;
  const companyIds = new Map<object, string>();

  for (const company of companies) {
    const row = company.contacts[0]?.row ?? 0;
    const payload = {
      name: company.name,
      website: company.website,
      notes: company.notes,
      status: company.status,
      kind: company.kind,
      can_reengage: company.can_reengage,
      follow_up_at: company.follow_up_at,
      follow_up_note: company.follow_up_note,
      summary: company.summary,
      linkedin_url: company.linkedin_url,
    };

    if (company.id) {
      if (!existingById.has(company.id)) {
        errors.push({
          row,
          message: `company_id ${company.id} was not found.`,
        });
        continue;
      }

      const { error } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", company.id);
      if (error) {
        errors.push({ row, message: error.message });
        continue;
      }

      if (company.verticals.length > 0) {
        const verticals = await replaceCompanyVerticals(
          supabase,
          company.id,
          company.verticals,
          verticalsCache,
        );
        if (verticals && "error" in verticals) {
          errors.push({ row, message: verticals.error });
          continue;
        }
        verticalsAssigned += 1;
      }

      companyIds.set(company, company.id);
      existingById.set(company.id, { id: company.id, name: company.name });
      existingByName.set(company.name.trim().toLowerCase(), company.id);
      companiesUpdated += 1;
      continue;
    }

    const existingId = existingByName.get(company.name.toLowerCase());
    if (existingId) {
      companyIds.set(company, existingId);
      const patch: {
        summary?: string | null;
        linkedin_url?: string | null;
        notes?: string | null;
        website?: string | null;
      } = {};
      if (company.summary) patch.summary = company.summary;
      if (company.linkedin_url) patch.linkedin_url = company.linkedin_url;
      if (company.notes) patch.notes = company.notes;
      if (company.website) patch.website = company.website;

      let wrote = false;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("companies")
          .update(patch)
          .eq("id", existingId);
        if (error) {
          errors.push({ row, message: error.message });
        } else {
          wrote = true;
        }
      }

      if (company.verticals.length > 0) {
        const verticals = await replaceCompanyVerticals(
          supabase,
          existingId,
          company.verticals,
          verticalsCache,
        );
        if (verticals && "error" in verticals) {
          errors.push({ row, message: verticals.error });
        } else {
          wrote = true;
          verticalsAssigned += 1;
        }
      }

      if (wrote) companiesUpdated += 1;
      else companiesMatched += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("companies")
      .insert({
        ...payload,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      errors.push({
        row,
        message: error?.message ?? `Could not create ${company.name}.`,
      });
      continue;
    }

    const verticals = await attachCompanyVerticals(
      supabase,
      data.id,
      company.verticals,
      verticalsCache,
    );
    if (verticals && "error" in verticals) {
      errors.push({ row, message: verticals.error });
    } else if (company.verticals.length > 0) {
      verticalsAssigned += 1;
    }

    companyIds.set(company, data.id);
    existingById.set(data.id, { id: data.id, name: company.name });
    existingByName.set(company.name.toLowerCase(), data.id);
    companiesCreated += 1;
  }

  const importedIds = new Set(companyIds.values());
  const contactsResult = await fetchAllRows<{
    id: string;
    company_id: string;
    full_name: string;
    email: string | null;
    is_primary: boolean;
  }>((from, to) =>
    supabase
      .from("contacts")
      .select("id, company_id, full_name, email, is_primary")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (contactsResult.error) {
    return emptyImportResult({
      companiesCreated,
      companiesMatched,
      companiesUpdated,
      verticalsAssigned,
      errors,
      error: contactsResult.error,
    });
  }

  const existingContactsById = new Map(
    contactsResult.data.map((contact) => [contact.id, contact]),
  );
  const existingContactKeys = new Set<string>();
  const companiesWithPrimary = new Set<string>();

  for (const contact of contactsResult.data) {
    if (!importedIds.has(contact.company_id)) continue;
    const email = (contact.email ?? "").trim().toLowerCase();
    if (email) {
      existingContactKeys.add(`${contact.company_id}:email:${email}`);
    }
    existingContactKeys.add(
      `${contact.company_id}:name:${contact.full_name.trim().toLowerCase()}`,
    );
    if (contact.is_primary) {
      companiesWithPrimary.add(contact.company_id);
    }
  }

  const toInsert: Array<{
    company_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    linkedin_url: string | null;
    notes: string | null;
    is_primary: boolean;
  }> = [];
  let contactsUpdated = 0;
  let contactsSkipped = 0;

  for (const company of companies) {
    const companyId = companyIds.get(company);
    if (!companyId) continue;

    for (const contact of company.contacts) {
      if (contact.id) {
        const existing = existingContactsById.get(contact.id);
        if (!existing) {
          errors.push({
            row: contact.row,
            message: `contact_id ${contact.id} was not found.`,
          });
          continue;
        }
        if (existing.company_id !== companyId) {
          errors.push({
            row: contact.row,
            message: "contact_id belongs to a different company.",
          });
          continue;
        }

        const { error } = await supabase
          .from("contacts")
          .update({
            full_name: contact.full_name,
            email: contact.email,
            phone: contact.phone,
            title: contact.title,
            linkedin_url: contact.linkedin_url,
            notes: contact.notes,
            is_primary: contact.is_primary,
          })
          .eq("id", contact.id)
          .eq("company_id", companyId);
        if (error) {
          errors.push({ row: contact.row, message: error.message });
          continue;
        }
        contactsUpdated += 1;
        if (contact.is_primary) companiesWithPrimary.add(companyId);
        continue;
      }

      const email = contact.email;
      const nameKey = `${companyId}:name:${contact.full_name.toLowerCase()}`;
      const emailKey = email ? `${companyId}:email:${email}` : null;
      if (
        existingContactKeys.has(nameKey) ||
        (emailKey && existingContactKeys.has(emailKey))
      ) {
        contactsSkipped += 1;
        continue;
      }

      const isPrimary =
        contact.is_primary && !companiesWithPrimary.has(companyId);
      toInsert.push({
        company_id: companyId,
        full_name: contact.full_name,
        email,
        phone: contact.phone,
        title: contact.title,
        linkedin_url: contact.linkedin_url,
        notes: contact.notes,
        is_primary: isPrimary,
      });
      existingContactKeys.add(nameKey);
      if (emailKey) existingContactKeys.add(emailKey);
      if (isPrimary) companiesWithPrimary.add(companyId);
    }
  }

  let contactsCreated = 0;
  if (toInsert.length > 0) {
    const { error } = await supabase.from("contacts").insert(toInsert);
    if (error) {
      return {
        companiesCreated,
        companiesMatched,
        companiesUpdated,
        contactsCreated,
        contactsUpdated,
        contactsSkipped,
        verticalsAssigned,
        warning,
        errors,
        error: error.message,
      };
    }
    contactsCreated = toInsert.length;
  }

  revalidatePath("/crm");
  return {
    companiesCreated,
    companiesMatched,
    companiesUpdated,
    contactsCreated,
    contactsUpdated,
    contactsSkipped,
    verticalsAssigned,
    warning,
    errors,
  };
}
