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
      "id, email, full_name, title, avatar_path, is_platform_admin, updated_at, deleted_at",
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
