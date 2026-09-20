import { formatShortDateTime } from "@/lib/format-date";
import type { ThemeCommit } from "@/lib/github/theme";
import { THEME_COMMIT_NONE } from "@/lib/theme-deploy";

function optionLabel(commit: ThemeCommit) {
  const message =
    commit.message.length > 72
      ? `${commit.message.slice(0, 71)}…`
      : commit.message;
  const when = commit.committedAt
    ? formatShortDateTime(commit.committedAt)
    : null;
  return [commit.shortSha, message, commit.author, when]
    .filter(Boolean)
    .join(" · ");
}

export function ThemeDeploySelect({
  name = "theme_commit",
  value,
  commits,
  currentSha,
  currentMessage,
  error,
  onChange,
  id,
}: {
  name?: string;
  value: string;
  commits: ThemeCommit[];
  currentSha?: string | null;
  currentMessage?: string | null;
  error?: string | null;
  onChange?: (value: string) => void;
  id?: string;
}) {
  const extra =
    currentSha && !commits.some((commit) => commit.sha === currentSha)
      ? [
          {
            sha: currentSha,
            shortSha: currentSha.slice(0, 7),
            message: currentMessage?.trim() || "Saved theme deploy",
            author: null,
            committedAt: null,
            url: "",
          } satisfies ThemeCommit,
        ]
      : [];

  return (
    <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
      Theme deploy
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
      >
        <option value="">Select a commit…</option>
        <option value={THEME_COMMIT_NONE}>No theme deploy</option>
        {[...extra, ...commits].map((commit) => (
          <option key={commit.sha} value={commit.sha}>
            {optionLabel(commit)}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-xs text-[var(--danger)]">{error}</span>
      ) : (
        <span className="text-xs">
          Required before Done. A push to this branch is live.
        </span>
      )}
    </label>
  );
}
