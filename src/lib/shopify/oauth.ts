import { createHmac, randomBytes } from "node:crypto";

import { appUrl } from "@/lib/app-url";
import {
  signedToken,
  timingSafeHexEqual,
  verifySignedToken,
} from "@/lib/shopify/crypto";
import { shopAdminOrigin } from "@/lib/shopify/domain";
import { shopifyScopesParam } from "@/lib/shopify/scopes";

export const SHOPIFY_OAUTH_COOKIE = "parallel_shopify_oauth";
export const SHOPIFY_CALLBACK_PATH = "/api/shopify/callback";

export type ShopifyOAuthState = {
  projectId: string;
  shop: string;
  nonce: string;
};

export function shopifyCallbackUrl() {
  return `${appUrl()}${SHOPIFY_CALLBACK_PATH}`;
}

export function createOAuthState(projectId: string, shop: string) {
  const state: ShopifyOAuthState = {
    projectId,
    shop,
    nonce: randomBytes(16).toString("hex"),
  };
  return {
    nonce: state.nonce,
    cookieValue: signedToken(Buffer.from(JSON.stringify(state)).toString("base64url")),
  };
}

export function parseOAuthCookie(token: string | undefined) {
  if (!token) return null;
  const payload = verifySignedToken(token);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as ShopifyOAuthState;
    if (!parsed.projectId || !parsed.shop || !parsed.nonce) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shopifyAuthorizeUrl(input: {
  shop: string;
  clientId: string;
  nonce: string;
}) {
  const url = new URL(`${shopAdminOrigin(input.shop)}/admin/oauth/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", shopifyScopesParam());
  url.searchParams.set("redirect_uri", shopifyCallbackUrl());
  url.searchParams.set("state", input.nonce);
  return url.toString();
}

export function verifyShopifyHmac(
  searchParams: URLSearchParams,
  clientSecret: string,
) {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHmac("sha256", clientSecret).update(message).digest("hex");
  return timingSafeHexEqual(digest, hmac);
}

export async function exchangeShopifyAccessToken(input: {
  shop: string;
  clientId: string;
  clientSecret: string;
  code: string;
}) {
  const response = await fetch(
    `${shopAdminOrigin(input.shop)}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
      }),
    },
  );

  const json = (await response.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !json?.access_token) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        `Shopify token exchange failed (${response.status}).`,
    );
  }

  return {
    accessToken: json.access_token,
    scope: json.scope ?? null,
  };
}
