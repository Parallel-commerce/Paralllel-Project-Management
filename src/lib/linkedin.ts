function linkedinUrlFromRaw(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function linkedinHost(hostname: string) {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return /^(?:[a-z]{2}\.)?linkedin\.com$/.test(host);
}

/** Canonical company LinkedIn page, or null if the value is not one. */
export function normalizeCompanyLinkedInUrl(raw: string) {
  const url = linkedinUrlFromRaw(raw);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
  if (!linkedinHost(url.hostname)) return null;
  const match = url.pathname.match(/^\/(company|school)\/([^/]+)/i);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const slug = match[2];
  if (!slug) return null;
  return `https://www.linkedin.com/${kind}/${slug}`;
}

/** Canonical personal LinkedIn profile, or null if the value is not one. */
export function normalizePersonLinkedInUrl(raw: string) {
  const url = linkedinUrlFromRaw(raw);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
  if (!linkedinHost(url.hostname)) return null;
  const match = url.pathname.match(/^\/in\/([^/]+)/i);
  if (!match?.[1]) return null;
  return `https://www.linkedin.com/in/${match[1]}`;
}
