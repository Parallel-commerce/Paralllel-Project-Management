import type { ThemeCommit, ThemeGitRef } from "@/lib/github/theme";

export const THEME_COMMIT_NONE = "__none__";

export const THEME_DEPLOY_REQUIRED_MESSAGE =
  "Select a theme deploy before marking this done.";

export type ThemeDeploysState =
  | { enabled: false }
  | {
      enabled: true;
      git: ThemeGitRef;
      commits: ThemeCommit[];
      error: string | null;
    };

export type ThemeCommitSnapshot = {
  theme_commit_sha: string | null;
  theme_commit_message: string | null;
  theme_commit_url: string | null;
  theme_committed_at: string | null;
  theme_commit_none: boolean;
};

export function emptyThemeCommitSnapshot(): ThemeCommitSnapshot {
  return {
    theme_commit_sha: null,
    theme_commit_message: null,
    theme_commit_url: null,
    theme_committed_at: null,
    theme_commit_none: false,
  };
}

export function noneThemeCommitSnapshot(): ThemeCommitSnapshot {
  return {
    theme_commit_sha: null,
    theme_commit_message: null,
    theme_commit_url: null,
    theme_committed_at: null,
    theme_commit_none: true,
  };
}

export function snapshotFromCommit(commit: ThemeCommit): ThemeCommitSnapshot {
  return {
    theme_commit_sha: commit.sha,
    theme_commit_message: commit.message.slice(0, 500),
    theme_commit_url: commit.url,
    theme_committed_at: commit.committedAt,
    theme_commit_none: false,
  };
}

export function themeCommitChoiceFromTask(task: {
  theme_commit_sha?: string | null;
  theme_commit_none?: boolean;
}) {
  if (task.theme_commit_none) return THEME_COMMIT_NONE;
  return task.theme_commit_sha ?? "";
}

export function hasThemeDeployChoice(task: {
  theme_commit_sha?: string | null;
  theme_commit_none?: boolean;
}) {
  return Boolean(task.theme_commit_sha) || Boolean(task.theme_commit_none);
}

export function themeDeploysEnabled(
  state: ThemeDeploysState | null | undefined,
): state is Extract<ThemeDeploysState, { enabled: true }> {
  return Boolean(state?.enabled);
}
