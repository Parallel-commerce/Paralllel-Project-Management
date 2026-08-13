/** Public origin used in emails and auth redirects. Never vercel.app. */
export const CANONICAL_APP_URL = "https://clients.parallelcommerce.co.uk";

export function appUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  if (
    configured.startsWith("http://localhost") ||
    configured.startsWith("http://127.0.0.1")
  ) {
    return configured;
  }

  if (configured.includes("parallelcommerce.co.uk")) {
    return configured;
  }

  return CANONICAL_APP_URL;
}
