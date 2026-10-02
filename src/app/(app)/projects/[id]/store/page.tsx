import { notFound, redirect } from "next/navigation";

import { ProjectStoreView } from "@/components/project-store-view";
import { requireSessionUser } from "@/lib/auth";
import type { ProjectRole } from "@/types/database";

export const maxDuration = 300;

export default async function ProjectStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireSessionUser();

  const [{ data: project }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase.from("projects").select("id").eq("id", id).maybeSingle(),
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
  if (role === "client" && !profile?.is_platform_admin) {
    redirect(`/reports/${id}`);
  }

  return <ProjectStoreView projectId={id} isAdmin={isAdmin} />;
}
