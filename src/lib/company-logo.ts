export function websiteHostname(website: string | null | undefined) {
  if (!website) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return null;
    return host;
  } catch {
    return null;
  }
}

/** Public icon for a company website (Google’s favicon index). */
export function companyLogoUrl(website: string | null | undefined) {
  const host = websiteHostname(website);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}
