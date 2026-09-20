import { fetchThemeCommits } from "@/lib/github/theme";
import type { ThemeDeploysState } from "@/lib/theme-deploy";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function loadThemeDeploys(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ThemeDeploysState> {
  const { data } = await supabase
    .from("project_theme_git")
    .select("repo, branch")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data?.repo) {
    return { enabled: false };
  }

  const git = { repo: data.repo, branch: data.branch || "main" };
  const result = await fetchThemeCommits(git);
  if ("error" in result) {
    return { enabled: true, git, commits: [], error: result.error };
  }
  return { enabled: true, git, commits: result.commits, error: null };
}
