import type {
  ProjectShopifyConnection,
  StoreConnectionPublic,
} from "@/types/database";

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
