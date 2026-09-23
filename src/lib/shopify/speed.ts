import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecret,
  hasShopifyEncryptionKey,
} from "@/lib/shopify/crypto";
import { resolveSpeedTargets } from "@/lib/shopify/speed-urls";
import {
  hasPagespeedKey,
  runPagespeed,
  type SpeedFieldMetrics,
  type SpeedPageResult,
  type SpeedRunDigest,
  type SpeedSnapshotSource,
} from "@/lib/pagespeed";
import type { Database, ProjectShopifyConnection } from "@/types/database";

function emptyField(): SpeedFieldMetrics {
  return {
    lcp_ms: null,
    inp_ms: null,
    cls: null,
    category: null,
    passed: null,
  };
}

export async function captureStoreSpeed(
  supabase: SupabaseClient<Database>,
  projectId: string,
  options?: { source?: SpeedSnapshotSource },
): Promise<{ error: string } | { ok: true; runId: string }> {
  const source: SpeedSnapshotSource = options?.source ?? "manual";
  if (!hasPagespeedKey()) {
    return {
      error:
        "PAGESPEED_API_KEY is not set. Add a PageSpeed Insights API key to capture Core Web Vitals.",
    };
  }
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
  if (loadError) return { error: loadError.message };
  if (!row?.access_token_ciphertext) {
    return { error: "Connect the Shopify store before measuring speed." };
  }

  const accessToken = decryptSecret(row.access_token_ciphertext);
  const { data: snapshot } = await supabase
    .from("project_store_snapshots")
    .select("primary_domain")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { origin, targets } = await resolveSpeedTargets(
    row.shop_domain,
    accessToken,
    snapshot?.primary_domain,
  );

  const measured = await Promise.all(
    targets.map(async (target) => {
      try {
        const result = await runPagespeed(target.url);
        const page: SpeedPageResult = {
          page_kind: target.page_kind,
          url: result.page.url,
          title: target.title,
          lab: result.page.lab,
          field: result.page.field,
          opportunities: result.page.opportunities,
          error: null,
        };
        return { page, origin: result.origin };
      } catch (error) {
        const page: SpeedPageResult = {
          page_kind: target.page_kind,
          url: target.url,
          title: target.title,
          lab: {
            performance_score: null,
            lcp_ms: null,
            tbt_ms: null,
            cls: null,
          },
          field: emptyField(),
          opportunities: [],
          error:
            error instanceof Error
              ? error.message
              : "PageSpeed Insights could not analyse this URL.",
        };
        return { page, origin: emptyField() };
      }
    }),
  );

  const pages = measured.map((item) => item.page);
  const originField =
    measured.find((item) => item.origin.lcp_ms != null)?.origin ?? emptyField();

  const digest: SpeedRunDigest = {
    origin_url: origin,
    origin: originField,
    pages,
  };

  const { data: run, error: runError } = await supabase
    .from("project_store_speed_runs")
    .insert({
      project_id: projectId,
      source,
      origin_url: origin,
      origin_passed: originField.passed,
      origin_lcp_ms: originField.lcp_ms,
      origin_inp_ms: originField.inp_ms,
      origin_cls: originField.cls,
      origin_category: originField.category,
      digest: digest as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: runError?.message ?? "Could not save the speed snapshot." };
  }

  const { error: pagesError } = await supabase
    .from("project_store_speed_pages")
    .insert(
      pages.map((page) => ({
        run_id: run.id,
        project_id: projectId,
        page_kind: page.page_kind,
        url: page.url,
        title: page.title,
        performance_score: page.lab.performance_score,
        lab_lcp_ms: page.lab.lcp_ms,
        lab_tbt_ms: page.lab.tbt_ms,
        lab_cls: page.lab.cls,
        field_lcp_ms: page.field.lcp_ms,
        field_inp_ms: page.field.inp_ms,
        field_cls: page.field.cls,
        field_passed: page.field.passed,
        field_category: page.field.category,
        opportunities: page.opportunities,
        error: page.error,
        payload: {
          lab: page.lab,
          field: page.field,
        },
      })),
    );

  if (pagesError) {
    return { error: pagesError.message };
  }

  return { ok: true, runId: run.id };
}

export async function captureScheduledStoreSpeed(
  supabase: SupabaseClient<Database>,
) {
  if (!hasPagespeedKey()) {
    return { ok: true as const, skipped: true as const, results: [] };
  }

  const { data: connections, error } = await supabase
    .from("project_shopify_connections")
    .select("project_id")
    .eq("status", "connected");

  if (error) return { error: error.message };

  const results: {
    projectId: string;
    status: "captured" | "error";
    error?: string;
  }[] = [];

  for (const connection of connections ?? []) {
    const result = await captureStoreSpeed(supabase, connection.project_id, {
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
    results.push({ projectId: connection.project_id, status: "captured" });
  }

  return { ok: true as const, results };
}
