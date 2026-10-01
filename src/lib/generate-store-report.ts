import type { SupabaseClient } from "@supabase/supabase-js";

import { generateStoreReportNarrative } from "@/lib/ai/claude-store-report";
import { logActivity } from "@/lib/notify";
import type { ReportRangeInput } from "@/lib/reports";
import { fetchShop, fetchWeeklyStoreDigest } from "@/lib/shopify/weekly";
import {
  asStoreReportDigest,
  fillStoreReportComparison,
  resolveStoreMetricWindow,
  shouldSeedComparisonReport,
  storeReportTitle,
} from "@/lib/store-report";
import { loadStoreReportSpeed } from "@/lib/store-report-speed";
import type { Database, StoreReportDigest } from "@/types/database";

type Db = SupabaseClient<Database>;

type StoreReportDraft = {
  id: string;
  digest: StoreReportDigest;
};

function storeReportPeriodBounds(startYmd: string, endYmd: string) {
  return {
    period_start: `${startYmd}T00:00:00.000Z`,
    period_end: `${endYmd}T23:59:59.999Z`,
  };
}

export async function findStoreReportForPeriod(
  supabase: Db,
  projectId: string,
  startYmd: string,
  endYmd: string,
) {
  const bounds = storeReportPeriodBounds(startYmd, endYmd);
  const { data } = await supabase
    .from("project_reports")
    .select("id, digest")
    .eq("project_id", projectId)
    .eq("kind", "store")
    .eq("period_start", bounds.period_start)
    .eq("period_end", bounds.period_end)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const digest = asStoreReportDigest(data.digest, "store");
  return digest ? { id: data.id, digest } : null;
}

async function recordReportCreated(
  supabase: Db,
  input: {
    projectId: string;
    userId: string | null;
    reportId: string;
    title: string;
  },
) {
  if (input.userId) {
    await logActivity({
      projectId: input.projectId,
      actorId: input.userId,
      entityType: "report",
      entityId: input.reportId,
      action: "created",
      summary: `Created ${input.title}`,
    });
    return;
  }

  const { error } = await supabase.from("activity_events").insert({
    project_id: input.projectId,
    actor_id: null,
    entity_type: "report",
    entity_id: input.reportId,
    action: "created",
    summary: `Scheduled job created ${input.title}`,
    metadata: { source: "scheduled" },
  });
  if (error) {
    console.error("scheduled report activity failed:", error.message);
  }
}

async function createStoreReportDraft(input: {
  supabase: Db;
  userId: string | null;
  projectId: string;
  projectName: string;
  shop: string;
  accessToken: string;
  range: ReportRangeInput;
  comparison?: StoreReportDigest | null;
}): Promise<StoreReportDraft | { error: string }> {
  let digest: StoreReportDigest;
  try {
    digest = await fetchWeeklyStoreDigest(
      input.shop,
      input.accessToken,
      input.range,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not pull store metrics from Shopify for the selected range.",
    };
  }

  if (input.comparison) {
    digest = fillStoreReportComparison(digest, input.comparison);
  }

  const speed = await loadStoreReportSpeed(
    input.supabase,
    input.projectId,
    digest.week_end,
    digest.previous_week_end,
  );
  digest.speed = speed;
  if (!speed) {
    digest.unavailable.push("lighthouse");
  }

  const ai = await generateStoreReportNarrative({
    projectName: input.projectName,
    digest,
  });

  if (!ai.usedAi) {
    digest.warnings.push(
      ai.error ??
        "Claude did not write this draft, so the narrative is numbers only. Generate again after checking ANTHROPIC_API_KEY.",
    );
  }

  const title = storeReportTitle(
    digest.period,
    digest.week_start,
    digest.week_end,
  );
  const { data: report, error } = await input.supabase
    .from("project_reports")
    .insert({
      project_id: input.projectId,
      kind: "store",
      period: digest.period ?? "week",
      ...storeReportPeriodBounds(digest.week_start, digest.week_end),
      title,
      narrative: ai.narrative,
      digest,
      created_by: input.userId,
    })
    .select("id")
    .single();

  if (error || !report) {
    return { error: error?.message ?? "Could not create store report." };
  }

  await recordReportCreated(input.supabase, {
    projectId: input.projectId,
    userId: input.userId,
    reportId: report.id,
    title,
  });

  return { id: report.id, digest };
}

export async function generateStoreReportDrafts(input: {
  supabase: Db;
  userId: string | null;
  projectId: string;
  projectName: string;
  shop: string;
  accessToken: string;
  range: ReportRangeInput;
}): Promise<{ id: string; seededPrevious: boolean } | { error: string }> {
  let comparison: StoreReportDigest | null = null;
  let seededPrevious = false;

  if (shouldSeedComparisonReport(input.range.preset)) {
    try {
      const shopInfo = await fetchShop(input.shop, input.accessToken);
      const window = resolveStoreMetricWindow(input.range, shopInfo.timezone);
      if (!("error" in window)) {
        const existing = await findStoreReportForPeriod(
          input.supabase,
          input.projectId,
          window.previousWeekStart,
          window.previousWeekEnd,
        );
        if (existing) {
          comparison = existing.digest;
        } else {
          const seeded = await createStoreReportDraft({
            supabase: input.supabase,
            userId: input.userId,
            projectId: input.projectId,
            projectName: input.projectName,
            shop: input.shop,
            accessToken: input.accessToken,
            range:
              input.range.preset === "last_week"
                ? { preset: "week_before_last" }
                : { preset: "month_before_last" },
          });
          if (!("error" in seeded)) {
            comparison = seeded.digest;
            seededPrevious = true;
          }
        }
      }
    } catch {
      // The selected period can still generate if the earlier draft fails.
    }
  }

  const created = await createStoreReportDraft({
    ...input,
    comparison,
  });
  if ("error" in created) return created;
  return { id: created.id, seededPrevious };
}
