import Link from "next/link";

import { formatDateTime } from "@/lib/format-date";
import type { ThemeCommit, ThemeGitRef } from "@/lib/github/theme";

export function StoreThemeCommits({
  git,
  commits,
  error,
  canEdit,
  settingsHref = null,
}: {
  git: ThemeGitRef | null;
  commits: ThemeCommit[];
  error: string | null;
  canEdit: boolean;
  settingsHref?: string | null;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h3 className="font-medium">Theme deploys</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {git
          ? `Pushes to ${git.repo} (${git.branch}) are the live theme.`
          : "Pushes to main on the connected GitHub repo are the live theme."}
      </p>

      {!git ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {canEdit && settingsHref ? (
            <>
              Add the GitHub repo in{" "}
              <Link
                href={settingsHref}
                className="text-[var(--accent)] hover:underline"
              >
                Settings
              </Link>
              . Parallel reads commits on that branch.
            </>
          ) : canEdit ? (
            "Add the GitHub repo in Settings. Parallel reads commits on that branch."
          ) : (
            "Theme commit history will appear here once the repo is connected."
          )}
        </p>
      ) : error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {canEdit ? error : "Theme commits could not be loaded."}
        </p>
      ) : commits.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No commits found on {git.branch}.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="py-1.5 pr-3 font-medium">When</th>
                <th className="py-1.5 pr-3 font-medium">Commit</th>
                <th className="py-1.5 pr-3 font-medium">Message</th>
                <th className="py-1.5 font-medium">Author</th>
              </tr>
            </thead>
            <tbody>
              {commits.map((commit) => (
                <tr
                  key={commit.sha}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[var(--muted)]">
                    {commit.committedAt
                      ? formatDateTime(commit.committedAt)
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs">
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      {commit.shortSha}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3">{commit.message}</td>
                  <td className="py-1.5 text-[var(--muted)]">
                    {commit.author ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
