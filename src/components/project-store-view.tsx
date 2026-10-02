import Link from "next/link";

import { StoreDashboard } from "@/components/store-dashboard";
import { StoreSpeedPanel } from "@/components/store-speed-panel";
import { StoreThemeCommits } from "@/components/store-theme-commits";
import { fetchThemeCommits } from "@/lib/github/theme";
import { toPublicConnection } from "@/lib/shopify/connection";
import { STORE_SNAPSHOT_FETCH_LIMIT } from "@/lib/store-snapshot";
import { createClient } from "@/lib/supabase/server";
import type {
  ProjectShopifyConnection,
  ProjectStoreSnapshot,
  ProjectStoreSpeedPage,
  ProjectStoreSpeedRun,
  ProjectThemeGit,
} from "@/types/database";

export async function ProjectStoreView({
  projectId,
  isAdmin,
  embedded = false,
}: {
  projectId: string;
  isAdmin: boolean;
  embedded?: boolean;
}) {
  const supabase = await createClient();
  const [
    { data: connectionRow },
    { data: snapshotRows },
    { data: speedRunRow },
    { data: themeGitRow },
  ] = await Promise.all([
    isAdmin
      ? supabase
          .from("project_shopify_connections")
          .select("*")
          .eq("project_id", projectId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("project_store_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .order("captured_at", { ascending: false })
      .limit(STORE_SNAPSHOT_FETCH_LIMIT),
    supabase
      .from("project_store_speed_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_theme_git")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  const speedRun = (speedRunRow as ProjectStoreSpeedRun | null) ?? null;
  const { data: speedPageRows } = speedRun
    ? await supabase
        .from("project_store_speed_pages")
        .select("*")
        .eq("run_id", speedRun.id)
    : { data: [] };
  const speedPages = (speedPageRows ?? []) as ProjectStoreSpeedPage[];

  const connection = connectionRow
    ? toPublicConnection(connectionRow as ProjectShopifyConnection)
    : null;
  const history = (snapshotRows ?? []) as ProjectStoreSnapshot[];
  const snapshot = history[0] ?? null;
  const themeGit = (themeGitRow as ProjectThemeGit | null) ?? null;
  const themeCommitsResult = themeGit
    ? await fetchThemeCommits({
        repo: themeGit.repo,
        branch: themeGit.branch,
      })
    : null;

  return (
    <div>
      <div className="min-w-0">
        {embedded ? (
          <h3 className="font-medium">Store</h3>
        ) : (
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
            Store
          </h1>
        )}
        <p className="mt-1 text-sm text-[var(--muted)]">
          Live snapshot of this store’s Online Store orders and sales, plus
          sessions, conversion, and the published theme. Daily history is the
          last complete shop day.
          {embedded ? null : (
            <>
              {" "}
              <Link
                href={`/reports/${projectId}`}
                className="text-[var(--accent)] hover:underline"
              >
                View reports
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="mt-8 space-y-8">
        {snapshot ? (
          <StoreDashboard snapshot={snapshot} history={history} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--column)]/60 px-6 py-12 text-center">
            <p className="font-medium">Store dashboard isn’t available yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isAdmin ? (
                <>
                  Connect Shopify in{" "}
                  <Link
                    href={`/projects/${projectId}/settings`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    Settings
                  </Link>
                  , then sync a snapshot.
                </>
              ) : (
                "Your Parallel team will share store metrics here once the store is connected."
              )}
            </p>
          </div>
        )}

        <StoreThemeCommits
          git={
            themeGit
              ? { repo: themeGit.repo, branch: themeGit.branch }
              : null
          }
          commits={
            themeCommitsResult && "commits" in themeCommitsResult
              ? themeCommitsResult.commits
              : []
          }
          error={
            themeCommitsResult && "error" in themeCommitsResult
              ? themeCommitsResult.error
              : null
          }
          canEdit={isAdmin}
          settingsHref={isAdmin ? `/projects/${projectId}/settings` : null}
        />

        <StoreSpeedPanel
          projectId={projectId}
          run={speedRun}
          pages={speedPages}
          canRefresh={isAdmin && Boolean(connection?.has_access_token)}
        />
      </div>
    </div>
  );
}
