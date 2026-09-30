import { CreateCompanyForm } from "@/components/create-company-form";
import { CrmNav } from "@/components/crm-nav";
import { ImportCompaniesForm } from "@/components/import-companies-form";
import {
  ProspectsBoard,
  type ProspectBoardCompany,
} from "@/components/prospects-board";
import { requireCrmUser } from "@/lib/auth";
import { verticalsByCompanyId, type VerticalOption } from "@/lib/verticals";
import type { CompanyStatus } from "@/types/database";

export default async function CrmProspectsPage() {
  const { supabase } = await requireCrmUser();

  const [{ data: rows }, { data: linkRows }, { data: verticalRows }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, name, website, status, follow_up_at, summary, contacts(count)",
        )
        .eq("kind", "prospect")
        .order("follow_up_at", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("company_verticals")
        .select("company_id, verticals(id, name)"),
      supabase
        .from("verticals")
        .select("id, name")
        .order("name", { ascending: true }),
    ]);

  const verticalsByCompany = verticalsByCompanyId(linkRows ?? []);
  const verticals = (verticalRows ?? []) as VerticalOption[];

  const companies: ProspectBoardCompany[] = (rows ?? []).map((row) => {
    const countRaw = Array.isArray(row.contacts) ? row.contacts[0] : null;
    const contactCount =
      countRaw && typeof countRaw === "object" && "count" in countRaw
        ? Number(countRaw.count ?? 0)
        : 0;
    return {
      id: row.id as string,
      name: row.name as string,
      website: (row.website as string | null) ?? null,
      status: ((row.status as CompanyStatus | null) ?? "lead") as CompanyStatus,
      follow_up_at: (row.follow_up_at as string | null) ?? null,
      summary: (row.summary as string | null) ?? null,
      contactCount,
      verticals: verticalsByCompany.get(row.id as string) ?? [],
    };
  });

  return (
    <main className="app-container py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            CRM
          </p>
          <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
            Prospects
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Open opportunities you are trying to win. Drag cards between lead
            stages. Drop on Won or Lost to convert the company type.
          </p>
        </div>
        <CrmNav active="prospects" />
      </div>

      <div className="mt-8">
        {companies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-4 py-12 text-center">
            <p className="font-medium">No open prospects</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Add a prospect below to start filling the pipeline.
            </p>
          </div>
        ) : (
          <ProspectsBoard companies={companies} />
        )}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-medium">New prospect</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            New companies start as prospects with a lead status.
          </p>
          <CreateCompanyForm
            verticals={verticals}
            defaultKind="prospect"
            lockKind
          />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-medium">Export and import</h2>
          <ImportCompaniesForm />
        </div>
      </div>
    </main>
  );
}
