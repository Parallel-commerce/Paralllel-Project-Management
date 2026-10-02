import { notFound } from "next/navigation";

import { ProjectNav } from "@/components/project-nav";
import { requireSessionUser } from "@/lib/auth";
import { projectLogoPublicUrl } from "@/lib/project-logo";
import type { ProjectRole } from "@/types/database";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireSessionUser();

  const [{ data: project }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, name, logo_path")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (!project) {
    notFound();
  }

  const role = (membership?.role ?? "client") as ProjectRole;
  const isAdmin = role === "admin" || !!profile?.is_platform_admin;

  return (
    <div className="app-container py-6 sm:py-10">
      <ProjectNav
        projectId={id}
        name={project.name}
        logoUrl={projectLogoPublicUrl(project.logo_path)}
        isAdmin={isAdmin}
        showStore={isAdmin || role !== "client"}
      />
      {children}
    </div>
  );
}
