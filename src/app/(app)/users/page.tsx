import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { UsersTable, type UserRow } from "@/components/users-table";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRole } from "@/types/database";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_platform_admin) {
    redirect("/projects");
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, title, is_platform_admin")
    .order("email", { ascending: true });

  const { data: memberships } = await supabase
    .from("project_members")
    .select("user_id, project_id, role, projects(id, name)");

  const membershipsByUser = new Map<string, UserRow["memberships"]>();

  for (const row of memberships ?? []) {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const list = membershipsByUser.get(row.user_id) ?? [];
    list.push({
      project_id: row.project_id,
      project_name: (project?.name as string) ?? "Untitled project",
      role: row.role as ProjectRole,
    });
    membershipsByUser.set(row.user_id, list);
  }

  const users: UserRow[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    title: profile.title,
    is_platform_admin: profile.is_platform_admin,
    memberships: (membershipsByUser.get(profile.id) ?? []).sort((a, b) =>
      a.project_name.localeCompare(b.project_name),
    ),
  }));

  return (
    <div className="app-shell min-h-full">
      <AppHeader isPlatformAdmin />
      <main className="app-container py-6 sm:py-10">
        <h1 className="font-display text-3xl tracking-tight">Users</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Manage accounts, project roles, and platform admins.
        </p>
        <div className="mt-8">
          <UsersTable users={users} currentUserId={user.id} />
        </div>
      </main>
    </div>
  );
}
