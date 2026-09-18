const HANDLE = /^[a-z0-9][a-z0-9-]*$/;

export function normalizeShopDomain(input: string) {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? "";
  value = value.replace(/:\d+$/, "");

  if (value.endsWith(".myshopify.com")) {
    const handle = value.slice(0, -".myshopify.com".length);
    if (!HANDLE.test(handle)) return null;
    return `${handle}.myshopify.com`;
  }

  if (HANDLE.test(value)) {
    return `${value}.myshopify.com`;
  }

  return null;
}

export function shopAdminOrigin(shopDomain: string) {
  return `https://${shopDomain}`;
}
