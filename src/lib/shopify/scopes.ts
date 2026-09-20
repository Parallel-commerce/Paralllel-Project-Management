export const DEFAULT_SHOPIFY_SCOPES = [
  "read_orders",
  "read_themes",
  "read_reports",
] as const;

export function shopifyScopes() {
  const raw = process.env.SHOPIFY_SCOPES?.trim();
  if (!raw) return [...DEFAULT_SHOPIFY_SCOPES];
  const scopes = raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return scopes.length ? scopes : [...DEFAULT_SHOPIFY_SCOPES];
}

export function shopifyScopesParam() {
  return shopifyScopes().join(",");
}
