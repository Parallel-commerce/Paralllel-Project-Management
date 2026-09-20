import Link from "next/link";
import { notFound } from "next/navigation";

import { StoreDashboard } from "@/components/store-dashboard";
import { StoreSpeedPanel } from "@/components/store-speed-panel";
import { StoreSyncButton } from "@/components/store-sync-button";
import { StoreThemeCommits } from "@/components/store-theme-commits";
import { requireSessionUser } from "@/lib/auth";
import { fetchThemeCommits } from "@/lib/github/theme";
import { toPublicConnection } from "@/lib/shopify/connection";
import { STORE_SNAPSHOT_FETCH_LIMIT } from "@/lib/store-snapshot";
import type {
  ProjectRole,
  ProjectShopifyConnection,
  ProjectStoreSnapshot,
  ProjectStoreSpeedPage,
  ProjectStoreSpeedRun,
  ProjectThemeGit,
} from "@/types/database";

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
      supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
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

  const [
    { data: connectionRow },
    { data: snapshotRows },
    { data: speedRunRow },
    { data: themeGitRow },
  ] =
    await Promise.all([
    isAdmin
      ? supabase
          .from("project_shopify_connections")
          .select("*")
          .eq("project_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("project_store_snapshots")
      .select("*")
      .eq("project_id", id)
      .order("captured_at", { ascending: false })
      .limit(STORE_SNAPSHOT_FETCH_LIMIT),
    supabase
      .from("project_store_speed_runs")
      .select("*")
      .eq("project_id", id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_theme_git")
      .select("*")
      .eq("project_id", id)
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
    <main className="app-container py-6 sm:py-10">
      <Link
        href={`/projects/${id}`}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← {project.name}
      </Link>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-tight">Store</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Live snapshot of this store’s recent orders, sales, sessions,
            conversion, and published theme. Daily history is the last complete
            shop day.{" "}
            <Link
              href={`/projects/${id}/reports`}
              className="text-[var(--accent)] hover:underline"
            >
              View reports
            </Link>
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            {connection?.has_access_token ? (
              <StoreSyncButton projectId={id} enabled />
            ) : null}
            <Link
              href={`/projects/${id}/settings`}
              className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
            >
              Settings
            </Link>
          </div>
        ) : null}
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
                    href={`/projects/${id}/settings`}
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
          settingsHref={isAdmin ? `/projects/${id}/settings` : null}
        />

        <StoreSpeedPanel
          projectId={id}
          run={speedRun}
          pages={speedPages}
          canRefresh={isAdmin && Boolean(connection?.has_access_token)}
        />
      </div>
    </main>
  );
}
