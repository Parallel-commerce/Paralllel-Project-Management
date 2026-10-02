"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDateTime } from "@/lib/format-date";
import type { ThemeCommit, ThemeGitRef } from "@/lib/github/theme";

const PAGE_SIZE = 10;

function isShopifyBot(author: string | null) {
  return !!author && /shopify\[bot\]/i.test(author);
}

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
  const [showBots, setShowBots] = useState(false);
  const [page, setPage] = useState(0);
  const botCount = commits.filter((commit) => isShopifyBot(commit.author)).length;
  const visibleCommits = showBots
    ? commits
    : commits.filter((commit) => !isShopifyBot(commit.author));
  const pageCount = Math.max(1, Math.ceil(visibleCommits.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const pageCommits = visibleCommits.slice(start, start + PAGE_SIZE);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="font-medium">Theme deploys</h3>
        {botCount > 0 ? (
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={showBots}
              onChange={(event) => {
                setShowBots(event.target.checked);
                setPage(0);
              }}
              className="accent-[var(--accent)]"
            />
            Show shopify[bot]
          </label>
        ) : null}
      </div>
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
      ) : visibleCommits.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {commits.length === 0
            ? `No commits found on ${git.branch}.`
            : "Only Shopify bot commits on this branch."}
        </p>
      ) : (
        <div className="mt-3">
          <div className="overflow-x-auto">
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
                {pageCommits.map((commit) => (
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
          {pageCount > 1 ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                className="text-sm text-[var(--accent)] hover:underline disabled:text-[var(--muted)] disabled:no-underline"
              >
                Newer
              </button>
              <p className="text-xs text-[var(--muted)]">
                {start + 1}–{start + pageCommits.length} of{" "}
                {visibleCommits.length}
              </p>
              <button
                type="button"
                disabled={current >= pageCount - 1}
                onClick={() =>
                  setPage((value) => Math.min(pageCount - 1, value + 1))
                }
                className="text-sm text-[var(--accent)] hover:underline disabled:text-[var(--muted)] disabled:no-underline"
              >
                Older
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
