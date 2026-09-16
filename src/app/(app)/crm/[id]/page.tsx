import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyContacts } from "@/components/company-contacts";
import { CompanyEditor } from "@/components/company-editor";
import { CompanyKindTag } from "@/components/company-kind-tag";
import { CompanyMark } from "@/components/company-mark";
import { CompanyReengageTag } from "@/components/company-reengage-tag";
import { CompanyStatusTag } from "@/components/company-status-tag";
import { CompanyVerticalTag } from "@/components/company-vertical-tag";
import { ConvertCompanyForm } from "@/components/convert-company-form";
import { CrmBackLink } from "@/components/crm-list-place";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { getIsInternalUser, requireCrmUser } from "@/lib/auth";
import { crmHref } from "@/lib/crm-filters";
import {
  projectEngagementFromRow,
  projectEngagementSummary,
} from "@/lib/project-type";
import { verticalsFromJoin, type VerticalOption } from "@/lib/verticals";
import type { Company, Contact } from "@/types/database";

export const maxDuration = 60;

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireCrmUser();
  const canCreateProjects = await getIsInternalUser();

  const [
    { data: company },
    { data: contacts },
    { data: projects },
    { data: verticalRows },
  ] = await Promise.all([
      supabase
        .from("companies")
        .select("*, company_verticals(verticals(id, name))")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("*")
        .eq("company_id", id)
        .order("is_primary", { ascending: false })
        .order("full_name", { ascending: true }),
      supabase
        .from("projects")
        .select("id, name, project_engagement(project_type, monthly_hours)")
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("verticals")
        .select("id, name")
        .order("name", { ascending: true }),
    ]);

  if (!company) {
    notFound();
  }

  const companyRow = company as Company & {
    company_verticals?: Parameters<typeof verticalsFromJoin>[0];
  };
  const contactRows = (contacts ?? []) as Contact[];
  const allVerticals = (verticalRows ?? []) as VerticalOption[];
  const selectedVerticals = verticalsFromJoin(companyRow.company_verticals);

  return (
    <main className="app-container py-6 sm:py-10">
      <CrmBackLink />

      <div className="mt-3 flex items-start gap-3 sm:gap-4">
        <CompanyMark
          name={companyRow.name}
          website={companyRow.website}
          size="lg"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
              {companyRow.name}
            </h1>
            <CompanyKindTag kind={companyRow.kind} />
            <CompanyStatusTag status={companyRow.status} />
            <CompanyReengageTag canReengage={companyRow.can_reengage} />
            {selectedVerticals.map((item) => (
              <CompanyVerticalTag
                key={item.id}
                name={item.name}
                href={crmHref("all", "all", item.id)}
              />
            ))}
          </div>
          {(companyRow.website || companyRow.linkedin_url) ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {companyRow.website ? (
                <a
                  href={companyRow.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  {companyRow.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
              {companyRow.linkedin_url ? (
                <a
                  href={companyRow.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  LinkedIn
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-8">
          <CompanyEditor
            company={companyRow}
            verticals={allVerticals}
            selectedVerticals={selectedVerticals}
          />
          <CompanyContacts
            key={`${companyRow.id}-contacts-${contactRows
              .map((contact) => `${contact.id}:${contact.linkedin_url ?? ""}`)
              .join("|")}`}
            companyId={id}
            contacts={contactRows}
          />
        </div>
        <div className="flex flex-col gap-6">
          {canCreateProjects ? (
            <ConvertCompanyForm
              companyId={id}
              companyName={companyRow.name}
              contacts={contactRows}
            />
          ) : null}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <h2 className="font-medium">Projects</h2>
            {projects && projects.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {projects.map((project) => {
                  const engagement = projectEngagementFromRow(
                    project.project_engagement,
                  );
                  const summary = projectEngagementSummary(
                    engagement.projectType,
                    engagement.monthlyHours,
                  );
                  return (
                    <li
                      key={project.id}
                      className="flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${project.id}`}
                          className="block truncate text-sm text-[var(--accent)] hover:underline"
                        >
                          {project.name}
                        </Link>
                        {summary ? (
                          <p className="truncate text-xs text-[var(--muted)]">
                            {summary}
                          </p>
                        ) : null}
                      </div>
                      <DeleteProjectButton
                        projectId={project.id}
                        projectName={project.name}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No projects linked yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
