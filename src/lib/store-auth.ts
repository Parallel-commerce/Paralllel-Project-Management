import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type StoreAdmin =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string; email?: string | null };
    }
  | { ok: false; error: string };

export async function requireStoreAdmin(projectId: string): Promise<StoreAdmin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (membership?.role !== "admin" && !profile?.is_platform_admin) {
    return { ok: false, error: "Only project admins can manage the store dashboard." };
  }

  return { ok: true, supabase, user };
}
