import type { SupabaseClient } from "@supabase/supabase-js";

import { generateReportNarrative } from "@/lib/ai/claude-report";
import { logActivity } from "@/lib/notify";
import { buildDigestFromActivity } from "@/lib/reports";
import type { Database, ReportPeriod } from "@/types/database";

type Db = SupabaseClient<Database>;

export async function createProgressReportDraft(input: {
  supabase: Db;
  userId: string | null;
  projectId: string;
  projectName: string;
  window: {
    period: ReportPeriod;
    periodStart: Date;
    periodEnd: Date;
    label: string;
    title: string;
  };
}): Promise<{ id: string } | { error: string }> {
  const { data: events, error: eventsError } = await input.supabase
    .from("activity_events")
    .select("action, entity_type, summary, metadata")
    .eq("project_id", input.projectId)
    .gte("created_at", input.window.periodStart.toISOString())
    .lte("created_at", input.window.periodEnd.toISOString())
    .order("created_at", { ascending: true });

  if (eventsError) {
    return { error: eventsError.message };
  }

  const digest = buildDigestFromActivity(
    (events ?? []).map((event) => ({
      action: event.action,
      entity_type: event.entity_type,
      summary: event.summary,
      metadata: (event.metadata ?? {}) as Record<string, unknown>,
    })),
  );

  const ai = await generateReportNarrative({
    projectName: input.projectName,
    periodLabel: input.window.label,
    period: input.window.period,
    digest,
  });

  const { data: report, error } = await input.supabase
    .from("project_reports")
    .insert({
      project_id: input.projectId,
      kind: "progress",
      period: input.window.period,
      period_start: input.window.periodStart.toISOString(),
      period_end: input.window.periodEnd.toISOString(),
      title: input.window.title,
      narrative: ai.narrative,
      digest,
      created_by: input.userId,
    })
    .select("id")
    .single();

  if (error || !report) {
    return { error: error?.message ?? "Could not create report." };
  }

  if (input.userId) {
    await logActivity({
      projectId: input.projectId,
      actorId: input.userId,
      entityType: "report",
      entityId: report.id,
      action: "created",
      summary: `Created ${input.window.title}`,
    });
  } else {
    const { error: activityError } = await input.supabase
      .from("activity_events")
      .insert({
        project_id: input.projectId,
        actor_id: null,
        entity_type: "report",
        entity_id: report.id,
        action: "created",
        summary: `Scheduled job created ${input.window.title}`,
        metadata: { source: "scheduled" },
      });
    if (activityError) {
      console.error("scheduled progress report activity failed:", activityError.message);
    }
  }

  return { id: report.id };
}
