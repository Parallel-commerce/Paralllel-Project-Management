export const THEME_COMMIT_FETCH_LIMIT = 30;

export type ThemeGitRef = {
  repo: string;
  branch: string;
};

export type ThemeCommit = {
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  committedAt: string | null;
  url: string;
};

function defaultOwner() {
  return process.env.THEME_GITHUB_OWNER?.trim() || "";
}

export function normalizeThemeRepo(raw: string): string | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Enter the GitHub repo as owner/name." };

  const fromUrl = trimmed.match(
    /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/|$)/i,
  );
  if (fromUrl) {
    return `${fromUrl[1]}/${fromUrl[2].replace(/\.git$/i, "")}`;
  }

  const parts = trimmed.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length === 1) {
    const owner = defaultOwner();
    if (!owner) {
      return { error: "Use owner/name, for example Parallel-commerce/forty_v2." };
    }
    return `${owner}/${parts[0]}`;
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  }
  return { error: "Use owner/name, for example Parallel-commerce/forty_v2." };
}

export function normalizeThemeBranch(raw: string) {
  const branch = raw.trim() || "main";
  if (branch.length > 100 || /\s/.test(branch)) {
    return { error: "Enter a valid git branch name." };
  }
  return branch;
}

function githubToken() {
  return (
    process.env.THEME_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    ""
  );
}

export function hasThemeGithubToken() {
  return Boolean(githubToken());
}

type GithubCommit = {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string } | null;
    committer?: { name?: string; date?: string } | null;
  };
  author?: { login?: string } | null;
};

export async function fetchThemeCommits(
  ref: ThemeGitRef,
): Promise<{ commits: ThemeCommit[] } | { error: string }> {
  const token = githubToken();
  if (!token) {
    return {
      error:
        "THEME_GITHUB_TOKEN is not set. Add a GitHub token with read access to the theme repos.",
    };
  }

  const url = new URL(
    `https://api.github.com/repos/${ref.repo}/commits`,
  );
  url.searchParams.set("sha", ref.branch);
  url.searchParams.set("per_page", String(THEME_COMMIT_FETCH_LIMIT));

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "parallel-project-management",
    },
    next: { revalidate: 60 },
  });

  if (response.status === 404) {
    return { error: `GitHub could not find ${ref.repo} (${ref.branch}).` };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      error:
        "GitHub refused the theme token. Check THEME_GITHUB_TOKEN can read this repo.",
    };
  }
  if (!response.ok) {
    return { error: `GitHub commits failed (${response.status}).` };
  }

  const payload = (await response.json()) as GithubCommit[] | { message?: string };
  if (!Array.isArray(payload)) {
    return { error: payload.message || "GitHub returned no commits." };
  }

  const commits: ThemeCommit[] = payload.flatMap((item) => {
    const commit = mapGithubCommit(ref.repo, item);
    return commit ? [commit] : [];
  });

  return { commits };
}

export async function fetchThemeCommit(
  ref: ThemeGitRef,
  sha: string,
): Promise<ThemeCommit | { error: string }> {
  const token = githubToken();
  if (!token) {
    return {
      error:
        "THEME_GITHUB_TOKEN is not set. Add a GitHub token with read access to the theme repos.",
    };
  }

  const normalized = sha.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(normalized)) {
    return { error: "Select a valid theme commit." };
  }

  const response = await fetch(
    `https://api.github.com/repos/${ref.repo}/commits/${normalized}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "parallel-project-management",
      },
      next: { revalidate: 60 },
    },
  );

  if (response.status === 404 || response.status === 422) {
    return { error: `GitHub could not find that commit on ${ref.repo}.` };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      error:
        "GitHub refused the theme token. Check THEME_GITHUB_TOKEN can read this repo.",
    };
  }
  if (!response.ok) {
    return { error: `GitHub commit lookup failed (${response.status}).` };
  }

  const payload = (await response.json()) as GithubCommit;
  const commit = mapGithubCommit(ref.repo, payload);
  if (!commit) {
    return { error: "GitHub returned no commit." };
  }
  return commit;
}

function mapGithubCommit(repo: string, item: GithubCommit): ThemeCommit | null {
  if (!item.sha) return null;
  const sha = item.sha.toLowerCase();
  const message = (item.commit?.message ?? "").split("\n")[0]?.trim() || "—";
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message,
    author:
      item.author?.login ||
      item.commit?.author?.name ||
      item.commit?.committer?.name ||
      null,
    committedAt:
      item.commit?.committer?.date || item.commit?.author?.date || null,
    url: item.html_url || `https://github.com/${repo}/commit/${sha}`,
  };
}
