"use server";

import { loadThemeDeploys } from "@/lib/load-theme-deploys";
import { createClient } from "@/lib/supabase/server";
import type { ThemeDeploysState } from "@/lib/theme-deploy";

export async function listThemeDeploys(
  projectId: string,
): Promise<ThemeDeploysState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { enabled: false };
  return loadThemeDeploys(supabase, projectId);
}
