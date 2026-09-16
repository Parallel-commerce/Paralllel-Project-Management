import { buildCompanyExportCsv, type CompanyExportCompany } from "@/lib/crm-csv";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { verticalsByCompanyId } from "@/lib/verticals";
import type { Company, Contact } from "@/types/database";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type CrmClient = SupabaseClient<Database>;

type CompanyExportRow = Pick<
  Company,
  | "id"
  | "name"
  | "website"
  | "status"
  | "kind"
  | "can_reengage"
  | "summary"
  | "linkedin_url"
  | "notes"
  | "follow_up_at"
  | "follow_up_note"
>;

type ContactExportRow = Pick<
  Contact,
  | "id"
  | "company_id"
  | "full_name"
  | "email"
  | "phone"
  | "title"
  | "linkedin_url"
  | "notes"
  | "is_primary"
>;

export async function buildCrmCompaniesCsv(
  supabase: CrmClient,
): Promise<{ csv: string } | { error: string }> {
  const companiesResult = await fetchAllRows<CompanyExportRow>((from, to) =>
    supabase
      .from("companies")
      .select(
        "id, name, website, status, kind, can_reengage, summary, linkedin_url, notes, follow_up_at, follow_up_note",
      )
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (companiesResult.error) return { error: companiesResult.error };

  const contactsResult = await fetchAllRows<ContactExportRow>((from, to) =>
    supabase
      .from("contacts")
      .select(
        "id, company_id, full_name, email, phone, title, linkedin_url, notes, is_primary",
      )
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (contactsResult.error) return { error: contactsResult.error };

  const verticalsResult = await fetchAllRows<{
    company_id: string;
    verticals?: unknown;
  }>((from, to) =>
    supabase
      .from("company_verticals")
      .select("company_id, verticals(id, name)")
      .order("company_id", { ascending: true })
      .order("vertical_id", { ascending: true })
      .range(from, to),
  );
  if (verticalsResult.error) return { error: verticalsResult.error };

  const verticalsByCompany = verticalsByCompanyId(verticalsResult.data);
  const contactsByCompany = new Map<string, ContactExportRow[]>();
  for (const contact of contactsResult.data) {
    const list = contactsByCompany.get(contact.company_id) ?? [];
    list.push(contact);
    contactsByCompany.set(contact.company_id, list);
  }

  const companies: CompanyExportCompany[] = companiesResult.data.map(
    (company) => {
      const contacts = [...(contactsByCompany.get(company.id) ?? [])].sort(
        (a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
          return a.full_name.localeCompare(b.full_name);
        },
      );
      return {
        id: company.id,
        name: company.name,
        website: company.website,
        status: company.status,
        kind: company.kind,
        can_reengage: company.can_reengage,
        verticals: (verticalsByCompany.get(company.id) ?? []).map(
          (item) => item.name,
        ),
        summary: company.summary,
        linkedin_url: company.linkedin_url,
        notes: company.notes,
        follow_up_at: company.follow_up_at,
        follow_up_note: company.follow_up_note,
        contacts: contacts.map((contact) => ({
          id: contact.id,
          full_name: contact.full_name,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          linkedin_url: contact.linkedin_url,
          notes: contact.notes,
          is_primary: contact.is_primary,
        })),
      };
    },
  );

  return { csv: `\uFEFF${buildCompanyExportCsv(companies)}` };
}
