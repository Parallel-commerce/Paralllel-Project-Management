"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  encryptSecret,
  hasShopifyEncryptionKey,
} from "@/lib/shopify/crypto";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import {
  SHOPIFY_OAUTH_COOKIE,
  createOAuthState,
  shopifyAuthorizeUrl,
} from "@/lib/shopify/oauth";
import { captureShopifySnapshot } from "@/lib/shopify/sync";
import { captureStoreSpeed } from "@/lib/shopify/speed";
import { requireStoreAdmin } from "@/lib/store-auth";
import type {
  ProjectShopifyConnection,
  ShopifyConnectionStatus,
} from "@/types/database";

export async function saveShopifyCredentials(
  projectId: string,
  formData: FormData,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireStoreAdmin(projectId);
  if (!admin.ok) return { error: admin.error };

  if (!hasShopifyEncryptionKey()) {
    return {
      error:
        "SHOPIFY_TOKEN_ENCRYPTION_KEY is not set. Add it to the server environment first.",
    };
  }

  const shopDomain = normalizeShopDomain(String(formData.get("shop_domain") ?? ""));
  const clientId = String(formData.get("client_id") ?? "").trim();
  const clientSecret = String(formData.get("client_secret") ?? "").trim();

  if (!shopDomain) {
    return { error: "Enter a valid myshopify.com domain." };
  }
  if (!clientId) {
    return { error: "Client ID is required." };
  }

  const { data: existing } = await admin.supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const existingRow = existing as ProjectShopifyConnection | null;
  if (!clientSecret && !existingRow?.client_secret_ciphertext) {
    return { error: "Client secret is required." };
  }

  const shopChanged = existingRow?.shop_domain !== shopDomain;
  const clientChanged = existingRow?.client_id !== clientId;
  const secretChanged = Boolean(clientSecret);
  const resetToken = shopChanged || clientChanged || secretChanged;

  const nextStatus: ShopifyConnectionStatus = resetToken
    ? "pending"
    : existingRow?.status ?? "pending";

  const payload = {
    project_id: projectId,
    shop_domain: shopDomain,
    client_id: clientId,
    client_secret_ciphertext: clientSecret
      ? encryptSecret(clientSecret)
      : existingRow!.client_secret_ciphertext,
    access_token_ciphertext: resetToken
      ? null
      : existingRow?.access_token_ciphertext ?? null,
    scopes: resetToken ? null : existingRow?.scopes ?? null,
    status: nextStatus,
    last_error: resetToken ? null : existingRow?.last_error ?? null,
    last_synced_at: resetToken ? null : existingRow?.last_synced_at ?? null,
  };

  const { error } = await admin.supabase
    .from("project_shopify_connections")
    .upsert(payload, { onConflict: "project_id" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}/store`);
  return { ok: true };
}

export async function startShopifyConnect(projectId: string) {
  const admin = await requireStoreAdmin(projectId);
  if (!admin.ok) {
    return { error: admin.error };
  }

  if (!hasShopifyEncryptionKey()) {
    return {
      error:
        "SHOPIFY_TOKEN_ENCRYPTION_KEY is not set. Add it to the server environment first.",
    };
  }

  const { data: connection } = await admin.supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const row = connection as ProjectShopifyConnection | null;
  if (!row) {
    return { error: "Save the shop domain and app credentials first." };
  }

  const { nonce, cookieValue } = createOAuthState(projectId, row.shop_domain);
  const cookieStore = await cookies();
  cookieStore.set(SHOPIFY_OAUTH_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  redirect(
    shopifyAuthorizeUrl({
      shop: row.shop_domain,
      clientId: row.client_id,
      nonce,
    }),
  );
}

export async function disconnectShopifyStore(
  projectId: string,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireStoreAdmin(projectId);
  if (!admin.ok) return { error: admin.error };

  const { error } = await admin.supabase
    .from("project_shopify_connections")
    .update({
      access_token_ciphertext: null,
      scopes: null,
      status: "disconnected",
      last_error: null,
    })
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}/store`);
  return { ok: true };
}

export async function syncShopifySnapshot(
  projectId: string,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireStoreAdmin(projectId);
  if (!admin.ok) return { error: admin.error };

  const result = await captureShopifySnapshot(admin.supabase, projectId);
  if ("error" in result) return result;

  revalidatePath(`/projects/${projectId}/store`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function syncStoreSpeed(
  projectId: string,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireStoreAdmin(projectId);
  if (!admin.ok) return { error: admin.error };

  const result = await captureStoreSpeed(admin.supabase, projectId);
  if ("error" in result) return result;

  revalidatePath(`/projects/${projectId}/store`);
  return { ok: true };
}
