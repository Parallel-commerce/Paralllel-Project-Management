"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateReportNarrative } from "@/lib/ai/claude-report";
import { generateStoreReportNarrative } from "@/lib/ai/claude-store-report";
import { buildProjectReportEmail } from "@/lib/email-report";
import { appUrl, logActivity, sendHtmlEmail } from "@/lib/notify";
import {
  buildDigestFromActivity,
  parseReportRange,
  resolveReportWindow,
  type ReportRangeInput,
} from "@/lib/reports";
import { resolveStoreAccess } from "@/lib/shopify/connection";
import { fetchWeeklyStoreDigest } from "@/lib/shopify/weekly";
import { requireStoreAdmin } from "@/lib/store-auth";
import { asStoreReportDigest, storeReportTitle } from "@/lib/store-report";
import { createClient } from "@/lib/supabase/server";
import type {
  ProjectShopifyConnection,
  ReportDigest,
  StoreReportDigest,
} from "@/types/database";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

async function requireProjectAdmin(projectId: string): Promise<
  | { error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string; email?: string | null };
    }
> {
  const { supabase, user } = await requireUser();
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (membership?.role !== "admin" && !profile?.is_platform_admin) {
    return { error: "Only project admins can manage reports." };
  }

  return { ok: true, supabase, user };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function collectRecipients(
  formData: FormData,
): { emails: string[] } | { error: string } {
  const raw = [
    ...formData.getAll("recipients"),
    ...formData.getAll("extra_recipients"),
  ]
    .flatMap((value) => String(value).split(/[,;\n]+/))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const invalid = raw.find((email) => !EMAIL_RE.test(email));
  if (invalid) {
    return { error: `“${invalid}” is not a valid email address.` };
  }

  return { emails: [...new Set(raw)] };
}

export async function generateProjectReport(
  projectId: string,
  range: ReportRangeInput,
): Promise<{ error: string } | void> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const parsed = parseReportRange(range);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { supabase, user } = admin;
  const window = resolveReportWindow(parsed);
  if ("error" in window) {
    return { error: window.error };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return { error: "Project not found." };
  }

  const { data: events, error: eventsError } = await supabase
    .from("activity_events")
    .select("action, entity_type, summary, metadata")
    .eq("project_id", projectId)
    .gte("created_at", window.periodStart.toISOString())
    .lte("created_at", window.periodEnd.toISOString())
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
    projectName: project.name,
    periodLabel: window.label,
    digest,
  });

  const { data: report, error } = await supabase
    .from("project_reports")
    .insert({
      project_id: projectId,
      kind: "progress",
      period: window.period,
      period_start: window.periodStart.toISOString(),
      period_end: window.periodEnd.toISOString(),
      title: window.title,
      narrative: ai.narrative,
      digest,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !report) {
    return { error: error?.message ?? "Could not create report." };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "report",
    entityId: report.id,
    action: "created",
    summary: `Created ${window.title}`,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/reports`);
  redirect(`/projects/${projectId}/reports/${report.id}`);
}

export async function generateStoreReport(
  projectId: string,
  range: ReportRangeInput,
): Promise<{ error: string } | void> {
  const admin = await requireStoreAdmin(projectId);
  if (!admin.ok) {
    return { error: admin.error };
  }

  const parsed = parseReportRange(range);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { supabase, user } = admin;

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return { error: "Project not found." };
  }

  const { data: connection } = await supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const access = resolveStoreAccess(connection as ProjectShopifyConnection | null);
  if ("error" in access) {
    return { error: access.error };
  }

  let digest: StoreReportDigest;
  try {
    digest = await fetchWeeklyStoreDigest(access.shop, access.accessToken, parsed);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not pull store metrics from Shopify for the selected range.",
    };
  }

  const ai = await generateStoreReportNarrative({
    projectName: project.name,
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
  const { data: report, error } = await supabase
    .from("project_reports")
    .insert({
      project_id: projectId,
      kind: "store",
      period: digest.period ?? "week",
      period_start: `${digest.week_start}T00:00:00.000Z`,
      period_end: `${digest.week_end}T23:59:59.999Z`,
      title,
      narrative: ai.narrative,
      digest,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !report) {
    return { error: error?.message ?? "Could not create store report." };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "report",
    entityId: report.id,
    action: "created",
    summary: `Created ${title}`,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/reports`);
  revalidatePath(`/projects/${projectId}/store`);
  redirect(`/projects/${projectId}/reports/${report.id}`);
}

export async function updateReportNarrative(
  projectId: string,
  reportId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const { supabase } = admin;
  const narrative = String(formData.get("narrative") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!title) {
    return { error: "Title is required." };
  }

  const { error } = await supabase
    .from("project_reports")
    .update({
      title,
      narrative: narrative || null,
    })
    .eq("id", reportId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}/reports/${reportId}`);
  revalidatePath(`/projects/${projectId}/reports`);
  return { success: true };
}

export async function sendProjectReport(
  projectId: string,
  reportId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true; message: string }> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const { supabase, user } = admin;
  const recipients = collectRecipients(formData);
  if ("error" in recipients) {
    return { error: recipients.error };
  }
  if (recipients.emails.length === 0) {
    return { error: "Select or add at least one recipient." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  const { data: report } = await supabase
    .from("project_reports")
    .select("id, title, narrative, digest, period_start, period_end, kind")
    .eq("id", reportId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!project || !report) {
    return { error: "Report not found." };
  }

  const reportUrl = `${appUrl()}/projects/${projectId}/reports/${reportId}`;
  const storeDigest = asStoreReportDigest(report.digest, report.kind);
  const progressDigest =
    storeDigest ||
    !report.digest ||
    typeof report.digest !== "object" ||
    !("stats" in report.digest)
      ? null
      : (report.digest as ReportDigest);
  const { text, html } = buildProjectReportEmail({
    projectName: project.name,
    title: report.title,
    narrative: report.narrative,
    reportUrl,
    progressDigest,
  });

  const sentTo: string[] = [];
  const failures: string[] = [];

  for (const email of recipients.emails) {
    const resultEmail = await sendHtmlEmail(
      email,
      `${project.name}: ${report.title}`,
      text,
      html,
    );
    if ("error" in resultEmail && resultEmail.error) {
      failures.push(`${email}: ${resultEmail.error}`);
    } else if ("skipped" in resultEmail && resultEmail.skipped) {
      failures.push(`${email}: email not configured (RESEND_API_KEY)`);
    } else {
      sentTo.push(email);
    }
  }

  if (sentTo.length === 0) {
    return {
      error:
        failures[0] ??
        "No emails were sent. Check RESEND_API_KEY and recipients.",
    };
  }

  const { data: existing } = await supabase
    .from("project_reports")
    .select("sent_to")
    .eq("id", reportId)
    .maybeSingle();

  const mergedRecipients = [
    ...new Set([...(existing?.sent_to ?? []), ...sentTo]),
  ];

  const { error } = await supabase
    .from("project_reports")
    .update({
      sent_at: new Date().toISOString(),
      sent_to: mergedRecipients,
    })
    .eq("id", reportId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  // In-app notify matching client profiles
  const { data: clients } = await supabase
    .from("project_members")
    .select("user_id, profiles(email)")
    .eq("project_id", projectId)
    .eq("role", "client");

  for (const member of clients ?? []) {
    const profile = Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles;
    const email = (profile?.email as string | undefined)?.toLowerCase();
    if (!email || !sentTo.includes(email)) continue;

    await supabase.rpc("create_notification", {
      p_user_id: member.user_id,
      p_type: "report_sent",
      p_title: `New report: ${report.title}`,
      p_body: storeDigest
        ? `A store report for ${project.name} is ready.`
        : `A progress report for ${project.name} is ready.`,
      p_link: `/projects/${projectId}/reports/${reportId}`,
    });
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "report",
    entityId: reportId,
    action: "sent",
    summary: `Sent report “${report.title}” to ${sentTo.join(", ")}`,
    metadata: { recipients: sentTo },
  });

  revalidatePath(`/projects/${projectId}/reports/${reportId}`);
  revalidatePath(`/projects/${projectId}/reports`);

  if (failures.length) {
    return {
      success: true,
      message: `Sent to ${sentTo.length} recipient(s). Some failed: ${failures.join("; ")}`,
    };
  }

  return {
    success: true,
    message: `Sent to ${sentTo.length} recipient(s).`,
  };
}

export async function deleteProjectReport(
  projectId: string,
  reportId: string,
): Promise<{ error: string } | void> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const { supabase, user } = admin;
  const { data: report } = await supabase
    .from("project_reports")
    .select("title")
    .eq("id", reportId)
    .eq("project_id", projectId)
    .maybeSingle();

  const { error } = await supabase
    .from("project_reports")
    .delete()
    .eq("id", reportId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "report",
    entityId: reportId,
    action: "deleted",
    summary: `Deleted report “${report?.title ?? "report"}”`,
  });

  revalidatePath(`/projects/${projectId}/reports`);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/reports`);
}
