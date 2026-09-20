import {
  decryptSecret,
  hasShopifyEncryptionKey,
} from "@/lib/shopify/crypto";
import type {
  ProjectShopifyConnection,
  StoreConnectionPublic,
} from "@/types/database";

export function resolveStoreAccess(
  row: ProjectShopifyConnection | null,
): { error: string } | { shop: string; accessToken: string } {
  if (!hasShopifyEncryptionKey()) {
    return {
      error:
        "SHOPIFY_TOKEN_ENCRYPTION_KEY is not set. Add it to the server environment first.",
    };
  }
  if (!row?.access_token_ciphertext) {
    return { error: "Connect the Shopify store before generating a report." };
  }
  try {
    return {
      shop: row.shop_domain,
      accessToken: decryptSecret(row.access_token_ciphertext),
    };
  } catch {
    return {
      error: "Could not read the stored Shopify token. Reconnect the store.",
    };
  }
}

export function toPublicConnection(
  row: ProjectShopifyConnection,
): StoreConnectionPublic {
  return {
    shop_domain: row.shop_domain,
    client_id: row.client_id,
    has_client_secret: Boolean(row.client_secret_ciphertext),
    has_access_token: Boolean(row.access_token_ciphertext),
    status: row.status,
    last_error: row.last_error,
    last_synced_at: row.last_synced_at,
    scopes: row.scopes,
  };
}
