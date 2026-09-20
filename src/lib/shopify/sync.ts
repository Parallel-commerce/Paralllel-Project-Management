import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchStoreSnapshot } from "@/lib/shopify/admin";
import {
  decryptSecret,
  hasShopifyEncryptionKey,
} from "@/lib/shopify/crypto";
import type {
  Database,
  ProjectShopifyConnection,
  StoreSnapshotSource,
} from "@/types/database";

function snapshotWarning(snapshot: {
  salesAvailable: boolean;
  reportsAvailable: boolean;
}) {
  const parts: string[] = [];
  if (!snapshot.salesAvailable) {
    parts.push("Sales need the read_orders scope.");
  }
  if (!snapshot.reportsAvailable) {
    parts.push(
      "Sessions and conversion need read_reports. Add it on the custom app, then reconnect.",
    );
  }
  if (!parts.length) return null;
  return `Shop and theme synced. ${parts.join(" ")}`;
}

function scopesWithReports(scopes: string | null, reportsAvailable: boolean) {
  if (!reportsAvailable) return scopes;
  const parts = (scopes ?? "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!parts.includes("read_reports")) parts.push("read_reports");
  return parts.join(",") || scopes;
}

export async function captureShopifySnapshot(
  supabase: SupabaseClient<Database>,
  projectId: string,
  options?: { source?: StoreSnapshotSource },
): Promise<{ error: string } | { ok: true; skipped?: boolean }> {
  const source: StoreSnapshotSource = options?.source ?? "manual";
  if (!hasShopifyEncryptionKey()) {
    return {
      error:
        "SHOPIFY_TOKEN_ENCRYPTION_KEY is not set. Add it to the server environment first.",
    };
  }

  const { data: connection, error: loadError } = await supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const row = connection as ProjectShopifyConnection | null;
  if (loadError) {
    return { error: loadError.message };
  }
  if (!row?.access_token_ciphertext) {
    return { error: "Connect the Shopify store before syncing." };
  }

  try {
    const accessToken = decryptSecret(row.access_token_ciphertext);
    const snapshot = await fetchStoreSnapshot(row.shop_domain, accessToken);

    if (source === "scheduled" && snapshot.snapshotDate) {
      const { data: existing } = await supabase
        .from("project_store_snapshots")
        .select("id")
        .eq("project_id", projectId)
        .eq("snapshot_date", snapshot.snapshotDate)
        .limit(1)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("project_shopify_connections")
          .update({
            status: "connected",
            last_error: snapshotWarning(snapshot),
            last_synced_at: new Date().toISOString(),
            scopes: scopesWithReports(row.scopes, snapshot.reportsAvailable),
          })
          .eq("project_id", projectId);
        return { ok: true, skipped: true };
      }
    }

    const { error: insertError } = await supabase.from("project_store_snapshots").insert({
      project_id: projectId,
      shop_name: snapshot.shopName,
      shop_domain: snapshot.shopDomain,
      primary_domain: snapshot.primaryDomain,
      plan_name: snapshot.planName,
      currency: snapshot.currency,
      orders_1d: snapshot.orders1d,
      sales_1d: snapshot.sales1d,
      orders_7d: snapshot.orders7d,
      sales_7d: snapshot.sales7d,
      orders_30d: snapshot.orders30d,
      sales_30d: snapshot.sales30d,
      sessions_1d: snapshot.sessions1d,
      conversion_rate_1d: snapshot.conversionRate1d,
      sessions_7d: snapshot.sessions7d,
      conversion_rate_7d: snapshot.conversionRate7d,
      sessions_30d: snapshot.sessions30d,
      conversion_rate_30d: snapshot.conversionRate30d,
      sales_available: snapshot.salesAvailable,
      reports_available: snapshot.reportsAvailable,
      theme_name: snapshot.themeName,
      theme_updated_at: snapshot.themeUpdatedAt,
      snapshot_date: snapshot.snapshotDate,
      source,
      payload: snapshot.payload,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return { ok: true, skipped: true };
      }
      throw new Error(insertError.message);
    }

    await supabase
      .from("project_shopify_connections")
      .update({
        status: "connected",
        last_error: snapshotWarning(snapshot),
        last_synced_at: new Date().toISOString(),
        scopes: scopesWithReports(row.scopes, snapshot.reportsAvailable),
      })
      .eq("project_id", projectId);

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not sync this Shopify store.";
    await supabase
      .from("project_shopify_connections")
      .update({
        status: "error",
        last_error: message,
      })
      .eq("project_id", projectId);
    return { error: message };
  }
}

export async function captureScheduledStoreSnapshots(
  supabase: SupabaseClient<Database>,
) {
  const { data: connections, error } = await supabase
    .from("project_shopify_connections")
    .select("project_id")
    .eq("status", "connected");

  if (error) {
    return { error: error.message };
  }

  const results: {
    projectId: string;
    status: "captured" | "skipped" | "error";
    error?: string;
  }[] = [];

  for (const connection of connections ?? []) {
    const result = await captureShopifySnapshot(supabase, connection.project_id, {
      source: "scheduled",
    });
    if ("error" in result) {
      results.push({
        projectId: connection.project_id,
        status: "error",
        error: result.error,
      });
      continue;
    }
    results.push({
      projectId: connection.project_id,
      status: result.skipped ? "skipped" : "captured",
    });
  }

  return { ok: true as const, results };
}
