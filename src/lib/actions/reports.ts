"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateReportNarrative } from "@/lib/ai/claude-report";
import { appUrl, logActivity, sendPlainEmail } from "@/lib/notify";
import {
  buildDigestFromActivity,
  resolveReportWindow,
  type ReportPreset,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import type { ReportDigest } from "@/types/database";

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
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "admin") {
    return { error: "Only project admins can manage reports." };
  }

  return { ok: true, supabase, user };
}

export async function generateProjectReport(
  projectId: string,
  preset: ReportPreset,
): Promise<{ error: string } | void> {
  const admin = await requireProjectAdmin(projectId);
  if (!("ok" in admin)) {
    return { error: admin.error };
  }

  const { supabase, user } = admin;
  const window = resolveReportWindow(preset);

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
  const recipients = formData
    .getAll("recipients")
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { error: "Select at least one recipient." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  const { data: report } = await supabase
    .from("project_reports")
    .select("id, title, narrative, digest, period_start, period_end")
    .eq("id", reportId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!project || !report) {
    return { error: "Report not found." };
  }

  const digest = report.digest as ReportDigest;
  const reportUrl = `${appUrl()}/projects/${projectId}/reports/${reportId}`;
  const body = [
    report.narrative?.trim() || "Progress update attached.",
    "",
    "Snapshot",
    `• Tasks completed: ${digest.stats.tasks_completed}`,
    `• Tasks created: ${digest.stats.tasks_created}`,
    `• Comments: ${digest.stats.comments}`,
    `• Status updates: ${digest.stats.status_changes}`,
    digest.completed_tasks.length
      ? `\nCompleted:\n${digest.completed_tasks.map((t) => `• ${t}`).join("\n")}`
      : "",
    `\nView in Parallel: ${reportUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const sentTo: string[] = [];
  const failures: string[] = [];

  for (const email of recipients) {
    const resultEmail = await sendPlainEmail(
      email,
      `${project.name}: ${report.title}`,
      body,
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
      p_body: `A progress report for ${project.name} is ready.`,
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
