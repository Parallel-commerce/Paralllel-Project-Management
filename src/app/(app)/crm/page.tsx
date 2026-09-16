import Link from "next/link";

import { CompanyKindSelect, CompanyReengageSelect, CompanyStatusSelect } from "@/components/company-quick-select";
import { CompanyMark } from "@/components/company-mark";
import { CompanyVerticalTag } from "@/components/company-vertical-tag";
import { CreateCompanyForm } from "@/components/create-company-form";
import { CrmFilters } from "@/components/crm-filters";
import {
  CrmCompanyLink,
  CrmListPlaceRestore,
} from "@/components/crm-list-place";
import { DeleteCompanyButton } from "@/components/delete-company-button";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ImportCompaniesForm } from "@/components/import-companies-form";
import { requireCrmUser } from "@/lib/auth";
import {
  KIND_TABS,
  STATUS_TABS,
  crmHref,
  type KindTab,
  type StatusTab,
  type VerticalTab,
} from "@/lib/crm-filters";
import { formatDayMonth } from "@/lib/format-date";
import { verticalsByCompanyId, type VerticalOption } from "@/lib/verticals";
import type { Company } from "@/types/database";

type LinkedProject = { id: string; name: string };

type CrmCompanyListRow = {
  id: string;
  name: string;
  website: string | null;
  status: Company["status"];
  kind: Company["kind"];
  can_reengage: Company["can_reengage"];
  follow_up_at: string | null;
  summary: string | null;
  contacts: unknown;
  projects: LinkedProject[] | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatFollowUp(value: string | null, today: string) {
  if (!value) return null;
  const day = value.slice(0, 10);
  const overdue = day < today;
  return { label: formatDayMonth(day), overdue };
}

function contactCount(
  value: unknown,
): number {
  if (Array.isArray(value) && value[0] && typeof value[0] === "object" && "count" in value[0]) {
    return Number((value[0] as { count: number }).count ?? 0);
  }
  return 0;
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; vertical?: string }>;
}) {
  const { supabase } = await requireCrmUser();
  const params = await searchParams;
  const tab = (
    STATUS_TABS.some((item) => item.id === params.status)
      ? params.status
      : "all"
  ) as StatusTab;
  const kind = (
    KIND_TABS.some((item) => item.id === params.kind) ? params.kind : "all"
  ) as KindTab;
  const today = todayIso();

  const { data: verticalRows } = await supabase
    .from("verticals")
    .select("id, name")
    .order("name", { ascending: true });
  const verticals = (verticalRows ?? []) as VerticalOption[];
  const vertical = (
    verticals.some((item) => item.id === params.vertical)
      ? params.vertical
      : "all"
  ) as VerticalTab;

  const [{ data: linkRows }, companyIdsForVertical] = await Promise.all([
    supabase
      .from("company_verticals")
      .select("company_id, verticals(id, name)"),
    vertical === "all"
      ? Promise.resolve(null)
      : supabase
          .from("company_verticals")
          .select("company_id")
          .eq("vertical_id", vertical),
  ]);
  const verticalsByCompany = verticalsByCompanyId(linkRows ?? []);
  const verticalCompanyIds =
    companyIdsForVertical && "data" in companyIdsForVertical
      ? [
          ...new Set(
            (companyIdsForVertical.data ?? []).map((row) => row.company_id),
          ),
        ]
      : null;

  const select =
    "id, name, website, status, kind, can_reengage, follow_up_at, summary, contacts(count), projects(id, name)";

  let query = supabase.from("companies").select(select);
  if (kind !== "all") {
    query = query.eq("kind", kind);
  }
  if (verticalCompanyIds) {
    if (verticalCompanyIds.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", verticalCompanyIds);
    }
  }
  if (tab === "follow_ups") {
    query = query
      .lte("follow_up_at", today)
      .neq("status", "won")
      .order("follow_up_at", { ascending: true });
  } else if (tab === "all") {
    query = query.order("name", { ascending: true });
  } else {
    query = query.eq("status", tab).order("name", { ascending: true });
  }

  const { data } = await query;
  const companies = (data ?? []) as CrmCompanyListRow[];
  const isEmpty = companies.length === 0;
  const noCompaniesAtAll =
    tab === "all" && kind === "all" && vertical === "all" && isEmpty;

  return (
    <main className="app-container py-6 sm:py-10">
      {noCompaniesAtAll ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            CRM
          </p>
          <h1 className="mt-1 font-display text-2xl tracking-tight">
            Add your first prospect
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Companies are the record. Add contacts underneath, move them through
            the sales process, and create a project when you win.
          </p>
          <CreateCompanyForm verticals={verticals} />
          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <h2 className="font-medium">Export and import</h2>
            <ImportCompaniesForm />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <section className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              CRM
            </p>
            <h1 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
              Prospects
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Record whether a company is a prospect, customer, ex customer,
              lost opportunity, or another agency, then move them through the
              sales process.
            </p>

            <CrmFilters
              status={tab}
              kind={kind}
              vertical={vertical}
              verticals={verticals}
            />
            <CrmListPlaceRestore />

            {isEmpty ? (
              <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-4 py-10 text-center">
                <p className="font-medium">Nothing here</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {tab === "follow_ups"
                    ? "No follow-ups are due."
                    : vertical !== "all" && tab === "all" && kind === "all"
                      ? "No companies in this vertical yet."
                      : kind !== "all" && tab === "all"
                        ? "No companies of this type yet."
                        : "No companies in this stage yet."}
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-2">
                {companies.map((company) => {
                  const followUp = formatFollowUp(company.follow_up_at, today);
                  const count = contactCount(company.contacts);
                  const linkedProjects = (
                    Array.isArray(company.projects) ? company.projects : []
                  ) as LinkedProject[];
                  const assignedVerticals =
                    verticalsByCompany.get(company.id) ?? [];
                  return (
                    <li key={company.id} id={`crm-company-${company.id}`}>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--foreground)]/15 hover:bg-white">
                        <div className="flex min-h-[4.25rem] items-start gap-3 px-3 py-3 sm:items-center sm:px-4 sm:py-3.5">
                          <CrmCompanyLink
                            companyId={company.id}
                            className="shrink-0"
                          >
                            <CompanyMark
                              name={company.name}
                              website={company.website}
                            />
                          </CrmCompanyLink>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <CrmCompanyLink
                                  companyId={company.id}
                                  className="min-w-0"
                                >
                                  <p className="truncate font-medium tracking-tight">
                                    {company.name}
                                  </p>
                                </CrmCompanyLink>
                                {assignedVerticals.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {assignedVerticals.map((item) => (
                                      <CompanyVerticalTag
                                        key={item.id}
                                        name={item.name}
                                        href={crmHref(tab, kind, item.id)}
                                      />
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <CrmCompanyLink
                                  companyId={company.id}
                                  className="hidden text-sm text-[var(--accent)] sm:inline"
                                >
                                  Open
                                </CrmCompanyLink>
                                <DeleteCompanyButton
                                  companyId={company.id}
                                  companyName={company.name}
                                />
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <CompanyKindSelect
                                companyId={company.id}
                                kind={company.kind}
                              />
                              <CompanyStatusSelect
                                companyId={company.id}
                                status={company.status}
                              />
                              <CompanyReengageSelect
                                companyId={company.id}
                                canReengage={company.can_reengage}
                              />
                              <span className="text-xs text-[var(--muted)]">
                                {count} contact{count === 1 ? "" : "s"}
                              </span>
                              {followUp ? (
                                <span
                                  className={`text-xs ${
                                    followUp.overdue &&
                                    company.status !== "won"
                                      ? "text-[var(--danger)]"
                                      : "text-[var(--muted)]"
                                  }`}
                                >
                                  Follow up {followUp.label}
                                </span>
                              ) : null}
                            </div>
                            {company.summary ? (
                              <p className="mt-1.5 line-clamp-2 text-sm text-[var(--muted)]">
                                {company.summary}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {linkedProjects.length > 0 ? (
                          <ul className="border-t border-[var(--border)] px-3 py-2 sm:px-4">
                            {linkedProjects.map((project) => (
                              <li
                                key={project.id}
                                className="flex items-center gap-2 py-1"
                              >
                                <span className="shrink-0 text-xs text-[var(--muted)]">
                                  Project
                                </span>
                                <Link
                                  href={`/projects/${project.id}`}
                                  className="min-w-0 flex-1 truncate text-sm text-[var(--accent)] hover:underline"
                                >
                                  {project.name}
                                </Link>
                                <DeleteProjectButton
                                  projectId={project.id}
                                  projectName={project.name}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-80">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="font-medium">New company</h2>
              <CreateCompanyForm verticals={verticals} />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="font-medium">Export and import</h2>
              <ImportCompaniesForm />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
