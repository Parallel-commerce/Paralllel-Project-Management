import Link from "next/link";

import { CompanyKindTag } from "@/components/company-kind-tag";
import { CompanyMark } from "@/components/company-mark";
import { CompanyStatusTag } from "@/components/company-status-tag";
import { CreateCompanyForm } from "@/components/create-company-form";
import { CrmFilters } from "@/components/crm-filters";
import { DeleteCompanyButton } from "@/components/delete-company-button";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ImportCompaniesForm } from "@/components/import-companies-form";
import { requireCrmUser } from "@/lib/auth";
import {
  KIND_TABS,
  STATUS_TABS,
  type KindTab,
  type StatusTab,
} from "@/lib/crm-filters";
import { formatDayMonth } from "@/lib/format-date";

type LinkedProject = { id: string; name: string };

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
  searchParams: Promise<{ status?: string; kind?: string }>;
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

  const select =
    "id, name, website, status, kind, follow_up_at, contacts(count), projects(id, name)";

  let query = supabase.from("companies").select(select);
  if (kind !== "all") {
    query = query.eq("kind", kind);
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

  const { data: companies } = await query;
  const isEmpty = (companies ?? []).length === 0;
  const noCompaniesAtAll = tab === "all" && kind === "all" && isEmpty;

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
          <CreateCompanyForm />
          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <h2 className="font-medium">Import CSV</h2>
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
              Record whether a company is a prospect, customer, lost
              opportunity, or another agency, then move them through the sales
              process.
            </p>

            <CrmFilters status={tab} kind={kind} />

            {isEmpty ? (
              <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-4 py-10 text-center">
                <p className="font-medium">Nothing here</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {tab === "follow_ups"
                    ? "No follow-ups are due."
                    : kind !== "all" && tab === "all"
                      ? "No companies of this type yet."
                      : "No companies in this stage yet."}
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-2">
                {(companies ?? []).map((company) => {
                  const followUp = formatFollowUp(company.follow_up_at, today);
                  const count = contactCount(company.contacts);
                  const linkedProjects = (
                    Array.isArray(company.projects) ? company.projects : []
                  ) as LinkedProject[];
                  return (
                    <li key={company.id}>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--foreground)]/15 hover:bg-white">
                        <div className="flex min-h-[4.25rem] items-center gap-2 sm:gap-3">
                          <Link
                            href={`/crm/${company.id}`}
                            className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
                          >
                            <CompanyMark
                              name={company.name}
                              website={company.website}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium tracking-tight">
                                {company.name}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                                <CompanyKindTag kind={company.kind} />
                                <CompanyStatusTag status={company.status} />
                                <span>
                                  {count} contact{count === 1 ? "" : "s"}
                                </span>
                                {followUp ? (
                                  <span
                                    className={
                                      followUp.overdue &&
                                      company.status !== "won"
                                        ? "text-[var(--danger)]"
                                        : ""
                                    }
                                  >
                                    Follow up {followUp.label}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <span className="hidden shrink-0 text-sm text-[var(--accent)] sm:inline">
                              Open
                            </span>
                          </Link>
                          <div className="pr-2 sm:pr-3">
                            <DeleteCompanyButton
                              companyId={company.id}
                              companyName={company.name}
                            />
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
              <CreateCompanyForm />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="font-medium">Import CSV</h2>
              <ImportCompaniesForm />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
