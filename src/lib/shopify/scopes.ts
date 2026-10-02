export const DEFAULT_SHOPIFY_SCOPES = [
  "read_orders",
  "read_themes",
  "read_reports",
] as const;

export const COLOUR_GROUP_SCOPES = [
  "write_products",
  "write_metaobjects",
  "write_metaobject_definitions",
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

export function scopesForColourGrouping(enabled: boolean) {
  if (!enabled) return shopifyScopesParam();
  const scopes = new Set(shopifyScopes());
  for (const scope of COLOUR_GROUP_SCOPES) scopes.add(scope);
  return [...scopes].join(",");
}

export function missingColourGroupScopes(granted: string | null) {
  const have = new Set(
    (granted ?? "")
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  return COLOUR_GROUP_SCOPES.filter((scope) => !have.has(scope));
}
