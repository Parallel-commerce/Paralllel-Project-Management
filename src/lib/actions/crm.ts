"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalUser } from "@/lib/auth";
import { inviteMember } from "@/lib/actions/projects";
import { parseCompanyImportCsv, type ImportRowError } from "@/lib/crm-csv";
import { parseScheduledWeekdays } from "@/lib/scheduled-weekdays";
import { COMPANY_STATUSES, type CompanyStatus } from "@/types/database";

const IMPORT_MAX_BYTES = 512 * 1024;
const IMPORT_MAX_ROWS = 500;

const STATUS_VALUES = new Set<CompanyStatus>(
  COMPANY_STATUSES.map((item) => item.value),
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

export async function createCompany(
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase, user } = await requireInternalUser();
  const name = String(formData.get("name") ?? "").trim();
  const website = normalizeWebsite(String(formData.get("website") ?? ""));
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const statusResult = parseStatus(String(formData.get("status") ?? "lead"));
  if (typeof statusResult === "object") return statusResult;
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
      follow_up_at: followUp,
      follow_up_note: followUpNote,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create company." };
  }

  revalidatePath("/crm");
  redirect(`/crm/${data.id}`);
}

export async function updateCompany(
  companyId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase } = await requireInternalUser();
  const name = String(formData.get("name") ?? "").trim();
  const website = normalizeWebsite(String(formData.get("website") ?? ""));
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const statusResult = parseStatus(String(formData.get("status") ?? "lead"));
  if (typeof statusResult === "object") return statusResult;
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

export async function deleteCompany(
  companyId: string,
  options?: { redirect?: boolean },
): Promise<{ error: string } | void> {
  const { supabase } = await requireInternalUser();

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
  const { supabase } = await requireInternalUser();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailResult = parseEmail(String(formData.get("email") ?? ""));
  if (emailResult && typeof emailResult === "object") return emailResult;
  const phone = emptyToNull(String(formData.get("phone") ?? ""));
  const title = emptyToNull(String(formData.get("title") ?? ""));
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
  const { supabase } = await requireInternalUser();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailResult = parseEmail(String(formData.get("email") ?? ""));
  if (emailResult && typeof emailResult === "object") return emailResult;
  const phone = emptyToNull(String(formData.get("phone") ?? ""));
  const title = emptyToNull(String(formData.get("title") ?? ""));
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
  const { supabase } = await requireInternalUser();

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
  const { supabase, user } = await requireInternalUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = emptyToNull(String(formData.get("description") ?? ""));
  const scheduledWeekdays = parseScheduledWeekdays(formData);
  const inviteIds = formData
    .getAll("invite_contact_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!name) {
    return { error: "Project name is required." };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, status")
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

  if (company.status !== "won") {
    await supabase
      .from("companies")
      .update({ status: "won" })
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
  contactsCreated: number;
  contactsSkipped: number;
  errors: ImportRowError[];
  error?: string;
};

export async function importCompanies(
  formData: FormData,
): Promise<ImportCompaniesResult> {
  const { supabase, user } = await requireInternalUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return {
      companiesCreated: 0,
      companiesMatched: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      errors: [],
      error: "Choose a CSV file to import.",
    };
  }

  if (file.size > IMPORT_MAX_BYTES) {
    return {
      companiesCreated: 0,
      companiesMatched: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      errors: [],
      error: "CSV must be 512KB or smaller.",
    };
  }

  const text = await file.text();
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
  if (lineCount - 1 > IMPORT_MAX_ROWS) {
    return {
      companiesCreated: 0,
      companiesMatched: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      errors: [],
      error: `CSV can have at most ${IMPORT_MAX_ROWS} data rows.`,
    };
  }

  const parsed = parseCompanyImportCsv(text);
  if ("error" in parsed) {
    return {
      companiesCreated: 0,
      companiesMatched: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      errors: [],
      error: parsed.error,
    };
  }

  const { companies, errors } = parsed;

  if (companies.length === 0) {
    return {
      companiesCreated: 0,
      companiesMatched: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      errors,
      error: errors[0]?.message ?? "No companies found in the CSV.",
    };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("companies")
    .select("id, name");

  if (existingError) {
    return {
      companiesCreated: 0,
      companiesMatched: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      errors,
      error: existingError.message,
    };
  }

  const existingByName = new Map(
    (existingRows ?? []).map((row) => [row.name.trim().toLowerCase(), row.id]),
  );

  let companiesCreated = 0;
  let companiesMatched = 0;
  let contactsCreated = 0;
  let contactsSkipped = 0;
  const companyIds = new Map<string, string>();

  for (const company of companies) {
    const key = company.name.toLowerCase();
    const existingId = existingByName.get(key);
    if (existingId) {
      companyIds.set(key, existingId);
      companiesMatched += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: company.name,
        website: company.website,
        notes: company.notes,
        status: company.status,
        follow_up_at: company.follow_up_at,
        follow_up_note: company.follow_up_note,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      errors.push({
        row: company.contacts[0]?.row ?? 0,
        message: error?.message ?? `Could not create ${company.name}.`,
      });
      continue;
    }

    companyIds.set(key, data.id);
    existingByName.set(key, data.id);
    companiesCreated += 1;
  }

  const importedIds = [...companyIds.values()];
  const existingContactKeys = new Set<string>();
  const companiesWithPrimary = new Set<string>();

  if (importedIds.length > 0) {
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("company_id, full_name, email, is_primary")
      .in("company_id", importedIds);

    for (const contact of existingContacts ?? []) {
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
  }

  const toInsert: Array<{
    company_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    notes: string | null;
    is_primary: boolean;
  }> = [];

  for (const company of companies) {
    const companyId = companyIds.get(company.name.toLowerCase());
    if (!companyId) continue;

    for (const contact of company.contacts) {
      const email = contact.email;
      const nameKey = `${companyId}:name:${contact.full_name.toLowerCase()}`;
      const emailKey = email ? `${companyId}:email:${email}` : null;
      if (existingContactKeys.has(nameKey) || (emailKey && existingContactKeys.has(emailKey))) {
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
        notes: contact.notes,
        is_primary: isPrimary,
      });
      existingContactKeys.add(nameKey);
      if (emailKey) existingContactKeys.add(emailKey);
      if (isPrimary) companiesWithPrimary.add(companyId);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("contacts").insert(toInsert);
    if (error) {
      return {
        companiesCreated,
        companiesMatched,
        contactsCreated,
        contactsSkipped,
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
    contactsCreated,
    contactsSkipped,
    errors,
  };
}
