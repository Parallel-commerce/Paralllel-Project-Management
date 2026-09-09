import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  avatar_path: string | null;
  is_platform_admin: boolean;
  can_access_crm: boolean;
  updated_at: string;
  deleted_at: string | null;
};

/** Deduplicate Supabase client creation within a single RSC request. */
export const getSupabase = cache(async () => createClient());

/** Deduplicate auth.getUser() within a single RSC request. */
export const getSessionUser = cache(async () => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

/** Deduplicate current profile fetch within a single RSC request. */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, title, avatar_path, is_platform_admin, can_access_crm, updated_at, deleted_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  return (data as CurrentProfile | null) ?? null;
});

export async function requireSessionUser() {
  const { supabase, user } = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

/** True when the current user is a platform admin or an internal project member. */
export const getIsInternalUser = cache(async () => {
  const { supabase, user } = await getSessionUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("is_internal_user");
  if (!error) return !!data;

  const profile = await getCurrentProfile();
  if (profile?.is_platform_admin) return true;

  const { count } = await supabase
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("role", ["admin", "member"]);
  return (count ?? 0) > 0;
});

export async function requireInternalUser() {
  const session = await requireSessionUser();
  const isInternal = await getIsInternalUser();
  if (!isInternal) {
    redirect("/home");
  }
  return session;
}

/** True when the current user is a platform admin or has CRM access granted. */
export const getIsCrmUser = cache(async () => {
  const { supabase, user } = await getSessionUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("is_crm_user");
  if (!error) return !!data;

  const profile = await getCurrentProfile();
  return !!profile?.is_platform_admin || !!profile?.can_access_crm;
});

export async function requireCrmUser() {
  const session = await requireSessionUser();
  const isCrm = await getIsCrmUser();
  if (!isCrm) {
    redirect("/home");
  }
  return session;
}
