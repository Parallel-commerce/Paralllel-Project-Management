import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { captureShopifySnapshot } from "@/lib/shopify/sync";
import { appUrl } from "@/lib/app-url";
import { decryptSecret, encryptSecret } from "@/lib/shopify/crypto";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import {
  SHOPIFY_OAUTH_COOKIE,
  exchangeShopifyAccessToken,
  parseOAuthCookie,
  verifyShopifyHmac,
} from "@/lib/shopify/oauth";
import { createClient } from "@/lib/supabase/server";
import type { ProjectShopifyConnection } from "@/types/database";

export const maxDuration = 60;

function storeRedirect(projectId: string, params: Record<string, string>) {
  const url = new URL(`/projects/${projectId}/store`, `${appUrl()}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function clearOauthCookie(response: NextResponse) {
  response.cookies.set(SHOPIFY_OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const state = parseOAuthCookie(cookieStore.get(SHOPIFY_OAUTH_COOKIE)?.value);
  const shop = normalizeShopDomain(requestUrl.searchParams.get("shop") ?? "");
  const code = requestUrl.searchParams.get("code") ?? "";
  const nonce = requestUrl.searchParams.get("state") ?? "";

  if (!state) {
    return NextResponse.redirect(
      new URL("/home?error=shopify", requestUrl.origin),
    );
  }

  const fail = (message: string) =>
    clearOauthCookie(
      NextResponse.redirect(storeRedirect(state.projectId, { error: message })),
    );

  if (!shop || shop !== state.shop || !nonce || nonce !== state.nonce || !code) {
    return fail("Shopify did not return a valid install response.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail("Sign in again, then reconnect the store.");
  }

  const { data: connection } = await supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", state.projectId)
    .maybeSingle();

  const row = connection as ProjectShopifyConnection | null;
  if (!row || row.shop_domain !== shop) {
    return fail("Saved Shopify credentials do not match this shop.");
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(row.client_secret_ciphertext);
  } catch {
    return fail("Could not decrypt the saved client secret.");
  }

  if (!verifyShopifyHmac(requestUrl.searchParams, clientSecret)) {
    return fail("Shopify request signature was invalid.");
  }

  try {
    const token = await exchangeShopifyAccessToken({
      shop,
      clientId: row.client_id,
      clientSecret,
      code,
    });

    const { error } = await supabase
      .from("project_shopify_connections")
      .update({
        access_token_ciphertext: encryptSecret(token.accessToken),
        scopes: token.scope,
        status: "connected",
        last_error: null,
      })
      .eq("project_id", state.projectId);

    if (error) {
      return fail(error.message);
    }

    const snapshot = await captureShopifySnapshot(supabase, state.projectId);
    const redirectUrl = storeRedirect(
      state.projectId,
      "error" in snapshot
        ? { connected: "1", error: snapshot.error }
        : { connected: "1" },
    );
    return clearOauthCookie(NextResponse.redirect(redirectUrl));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not finish Shopify OAuth.";
    await supabase
      .from("project_shopify_connections")
      .update({ status: "error", last_error: message })
      .eq("project_id", state.projectId);
    return fail(message);
  }
}
