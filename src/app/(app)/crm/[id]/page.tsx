import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyContacts } from "@/components/company-contacts";
import { CompanyEditor } from "@/components/company-editor";
import { CompanyKindTag } from "@/components/company-kind-tag";
import { CompanyMark } from "@/components/company-mark";
import { CompanyStatusTag } from "@/components/company-status-tag";
import { ConvertCompanyForm } from "@/components/convert-company-form";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { getIsInternalUser, requireCrmUser } from "@/lib/auth";
import type { Company, Contact } from "@/types/database";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireCrmUser();
  const canCreateProjects = await getIsInternalUser();

  const [{ data: company }, { data: contacts }, { data: projects }] =
    await Promise.all([
      supabase.from("companies").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("contacts")
        .select("*")
        .eq("company_id", id)
        .order("is_primary", { ascending: false })
        .order("full_name", { ascending: true }),
      supabase
        .from("projects")
        .select("id, name")
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!company) {
    notFound();
  }

  const companyRow = company as Company;
  const contactRows = (contacts ?? []) as Contact[];

  return (
    <main className="app-container py-6 sm:py-10">
      <Link
        href="/crm"
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← Prospects
      </Link>

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
          </div>
          {companyRow.website ? (
            <a
              href={companyRow.website}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline"
            >
              {companyRow.website.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-8">
          <CompanyEditor company={companyRow} />
          <CompanyContacts companyId={id} contacts={contactRows} />
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
                {projects.map((project) => (
                  <li
                    key={project.id}
                    className="flex items-center gap-2"
                  >
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
