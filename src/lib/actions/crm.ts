"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalUser } from "@/lib/auth";
import { inviteMember } from "@/lib/actions/projects";
import { COMPANY_STATUSES, type CompanyStatus } from "@/types/database";

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
): Promise<{ error: string } | void> {
  const { supabase } = await requireInternalUser();

  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/crm");
  redirect("/crm");
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
