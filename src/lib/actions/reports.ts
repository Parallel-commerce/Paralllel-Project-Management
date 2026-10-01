"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateReportNarrative } from "@/lib/ai/claude-report";
import { createTask } from "@/lib/actions/projects";
import { buildProjectReportEmail } from "@/lib/email-report";
import { generateStoreReportDrafts } from "@/lib/generate-store-report";
import { appUrl, logActivity, sendHtmlEmailBatch } from "@/lib/notify";
import {
  collectReportActions,
  reportActionDescription,
} from "@/lib/report-actions";
import {
  buildDigestFromActivity,
  parseReportRange,
  resolveReportWindow,
  type ReportRangeInput,
} from "@/lib/reports";
import { resolveStoreAccess } from "@/lib/shopify/connection";
import { requireStoreAdmin } from "@/lib/store-auth";
import { asStoreReportDigest } from "@/lib/store-report";
import { loadStoreReportSpeed } from "@/lib/store-report-speed";
import { createClient } from "@/lib/supabase/server";
import type {
  ProjectShopifyConnection,
  ReportDigest,
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

function normalizeRecipientEmail(
  raw: string,
): { email: string } | { error: string } {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return {
      error: `“${email || raw.trim()}” is not a valid email address.`,
    };
  }
  return { email };
}

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

  for (const email of raw) {
    const parsed = normalizeRecipientEmail(email);
    if ("error" in parsed) return parsed;
  }

  return { emails: [...new Set(raw)] };
}

function revalidateReportRecipientPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/reports`);
  revalidatePath("/projects/[id]/reports/[reportId]", "page");
}

export async function addProjectReportRecipient(
  projectId: string,
  rawEmail: string,
): Promise<{ error: string } | { success: true; email: string }> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const parsed = normalizeRecipientEmail(rawEmail);
  if ("error" in parsed) return parsed;

  const { supabase, user } = admin;
  const { error } = await supabase.from("project_report_recipients").insert({
    project_id: projectId,
    email: parsed.email,
    created_by: user.id,
  });

  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  revalidateReportRecipientPaths(projectId);
  return { success: true, email: parsed.email };
}

export async function removeProjectReportRecipient(
  projectId: string,
  rawEmail: string,
): Promise<{ error: string } | { success: true }> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const parsed = normalizeRecipientEmail(rawEmail);
  if ("error" in parsed) return parsed;

  const { supabase } = admin;
  const { error } = await supabase
    .from("project_report_recipients")
    .delete()
    .eq("project_id", projectId)
    .eq("email", parsed.email);

  if (error) {
    return { error: error.message };
  }

  revalidateReportRecipientPaths(projectId);
  return { success: true };
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
    period: window.period,
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

  const created = await generateStoreReportDrafts({
    supabase,
    userId: user.id,
    projectId,
    projectName: project.name,
    shop: access.shop,
    accessToken: access.accessToken,
    range: parsed,
  });

  if ("error" in created) {
    return { error: created.error };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/reports`);
  revalidatePath(`/projects/${projectId}/store`);
  redirect(
    `/projects/${projectId}/reports/${created.id}${created.seededPrevious ? "?seeded=1" : ""}`,
  );
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

async function deliverProjectReport(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  projectId: string;
  reportId: string;
  emails: string[];
}): Promise<{ error: string } | { success: true; message: string }> {
  const { supabase, projectId, reportId, emails } = input;
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  const { data: report } = await supabase
    .from("project_reports")
    .select("id, title, narrative, digest, period, period_start, period_end, kind")
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
    progressDigest: report.period === "month" ? null : progressDigest,
  });

  const delivery = await sendHtmlEmailBatch(
    emails,
    `${project.name}: ${report.title}`,
    text,
    html,
  );
  if ("skipped" in delivery) {
    return {
      error:
        "No emails were sent. Check RESEND_API_KEY and recipients.",
    };
  }

  const sentTo = delivery.sent;
  const failures = delivery.failures;

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
    actorId: input.userId,
    entityType: "report",
    entityId: reportId,
    action: "sent",
    summary: `Sent report “${report.title}” to ${sentTo.join(", ")}`,
    metadata: { recipients: sentTo },
  });

  revalidatePath(`/projects/${projectId}/reports/${reportId}`);
  revalidatePath(`/projects/${projectId}/reports`);
  revalidatePath("/home");

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

  const { data: standingRows, error: standingError } = await supabase
    .from("project_report_recipients")
    .select("email")
    .eq("project_id", projectId);

  if (standingError) {
    return { error: standingError.message };
  }

  const emails = [
    ...new Set([
      ...recipients.emails,
      ...(standingRows ?? []).map((row) => row.email),
    ]),
  ];

  if (emails.length === 0) {
    return { error: "Select or add at least one recipient." };
  }

  return deliverProjectReport({
    supabase,
    userId: user.id,
    projectId,
    reportId,
    emails,
  });
}

export async function sendStandingProjectReport(
  projectId: string,
  reportId: string,
): Promise<{ error: string } | { success: true; message: string }> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const { supabase, user } = admin;
  const { data: standingRows, error: standingError } = await supabase
    .from("project_report_recipients")
    .select("email")
    .eq("project_id", projectId);

  if (standingError) {
    return { error: standingError.message };
  }

  const emails = [
    ...new Set((standingRows ?? []).map((row) => row.email)),
  ];
  if (emails.length === 0) {
    return {
      error:
        "No saved recipients for this store. Open the report to choose who receives it.",
    };
  }

  return deliverProjectReport({
    supabase,
    userId: user.id,
    projectId,
    reportId,
    emails,
  });
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

export async function createReportActionTasks(
  projectId: string,
  reportId: string,
  listId: string,
  actionKeys: string[],
): Promise<
  | { error: string }
  | {
      created: { key: string; taskId: string; taskKey: string; existing: boolean }[];
    }
> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const keys = [...new Set(actionKeys.map((key) => key.trim()).filter(Boolean))];
  if (keys.length === 0) {
    return { error: "Choose at least one recommendation." };
  }
  if (keys.length > 20) {
    return { error: "Too many recommendations at once." };
  }

  const { supabase } = admin;
  const [{ data: report }, { data: list }] = await Promise.all([
    supabase
      .from("project_reports")
      .select("id, title, narrative, digest, kind")
      .eq("id", reportId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("lists")
      .select("id")
      .eq("id", listId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  if (!report) {
    return { error: "Report not found." };
  }
  if (!list) {
    return { error: "Choose a list on this project." };
  }

  const digest = asStoreReportDigest(report.digest, report.kind);
  const speed =
    digest?.speed ??
    (digest
      ? await loadStoreReportSpeed(
          supabase,
          projectId,
          digest.week_end,
          digest.previous_week_end,
        )
      : null);
  const actions = collectReportActions(report.narrative, speed);
  const wanted = new Set(keys);
  const selected = actions.filter((action) => wanted.has(action.key));
  if (selected.length === 0) {
    return { error: "Those recommendations are no longer in the report." };
  }

  const reportPath = `/projects/${projectId}/reports/${reportId}`;
  const created: {
    key: string;
    taskId: string;
    taskKey: string;
    existing: boolean;
  }[] = [];

  for (const action of selected) {
    const formData = new FormData();
    formData.set("title", action.title);
    formData.set(
      "description",
      reportActionDescription(action, report.title, reportPath),
    );
    formData.set("status", "todo");
    formData.set("task_type", "improvement");
    formData.set("source_report_id", reportId);
    formData.set("source_action_key", action.key);

    const result = await createTask(projectId, listId, formData);
    if (result && "error" in result) {
      const message = result.error ?? "Could not create task.";
      return {
        error:
          created.length > 0
            ? `Created ${created.length}, then failed: ${message}`
            : message,
      };
    }
    if (!result || !("id" in result) || !result.id) {
      return { error: "Could not create task." };
    }
    created.push({
      key: action.key,
      taskId: result.id,
      taskKey: result.key ?? "Task",
      existing: Boolean("existing" in result && result.existing),
    });
  }

  revalidatePath(`/projects/${projectId}/reports/${reportId}`);
  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  return { created };
}
