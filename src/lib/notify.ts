import { Resend } from "resend";

import { appUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  /** Optional longer copy for email; falls back to body. */
  emailBody?: string;
  link?: string;
  email?: string | null;
  /** Display name of the person who triggered the notification. */
  fromName?: string | null;
};

const COMMENT_TYPES = new Set([
  "task_comment",
  "task_comment_reply",
  "task_comment_mention",
  "chat_message",
]);

function absoluteAppUrl(path?: string | null) {
  const origin = appUrl().startsWith("http") ? appUrl() : `https://${appUrl()}`;
  if (!path) return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ||
    "Parallel Commerce <login@parallelcommerce.co.uk>";

  if (!apiKey) {
    return { skipped: true as const };
  }

  const resend = new Resend(apiKey);
  const absoluteLinkHint = text.includes("http")
    ? text
    : `${text}\n\nOpen Parallel: ${appUrl()}`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text: absoluteLinkHint,
    ...(html ? { html } : {}),
  });

  if (error) {
    console.error("Resend error:", error);
    return { error: error.message };
  }

  return { sent: true as const };
}

export async function sendPlainEmail(to: string, subject: string, text: string) {
  return sendEmail(to, subject, text);
}

/** Friendly reminder: open Parallel, enter email, use the one-time code. */
export async function sendSignInReminderEmail(input: {
  to: string;
  fullName?: string | null;
}) {
  const loginUrl = absoluteAppUrl("/login");
  const firstName =
    input.fullName?.trim().split(/\s+/)[0] ||
    input.to.split("@")[0] ||
    "there";

  const subject = "Your invite to Parallel";
  const text = [
    `Hi ${firstName},`,
    "",
    "You've been invited to Parallel — Parallel Commerce's project workspace.",
    "",
    "Getting started is simple:",
    `1. Open ${loginUrl}`,
    "2. Enter this email address",
    "3. We'll email you a one-time code",
    "4. Enter the code to sign in — no password needed",
    "",
    "If you don't see the code email, check spam or promotions, then try again from the sign-in page.",
    "",
    "Questions? Reply to this email or contact Parallel Commerce.",
    "",
    "— Parallel",
  ].join("\n");

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f1117;max-width:520px;margin:0 auto;padding:24px;">
    <p style="font-size:20px;font-weight:700;margin:0 0 16px;">parallel<span style="color:#e8420a;">.</span></p>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;">You've been invited to <strong>Parallel</strong> — Parallel Commerce's project workspace.</p>
    <p style="margin:0 0 8px;font-weight:600;">Getting started is simple:</p>
    <ol style="margin:0 0 20px;padding-left:20px;">
      <li style="margin-bottom:6px;">Open the sign-in page</li>
      <li style="margin-bottom:6px;">Enter <strong>${escapeHtml(input.to)}</strong></li>
      <li style="margin-bottom:6px;">We'll email you a one-time code</li>
      <li style="margin-bottom:6px;">Enter the code to sign in — no password needed</li>
    </ol>
    <p style="margin:0 0 24px;">
      <a href="${loginUrl}" style="display:inline-block;background:#e8420a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
        Open Parallel
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b6b72;">
      If you don't see the code email, check spam or promotions, then try again from the sign-in page.
    </p>
    <p style="margin:0;font-size:14px;color:#6b6b72;">— Parallel</p>
  </div>
  `.trim();

  return sendEmail(input.to, subject, text, html);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatEmailMultiline(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function firstNameFromProfile(
  fullName: string | null | undefined,
  email: string,
) {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return email.split("@")[0] || "there";
}

function notificationCtaLabel(type: string) {
  if (COMMENT_TYPES.has(type)) {
    return type === "chat_message" ? "Open conversation" : "View comment";
  }
  if (type === "project_invite") return "Open project";
  if (type.startsWith("task_")) return "Open task";
  return "Open in Parallel";
}

function buildNotificationEmail(input: {
  firstName: string;
  type: string;
  title: string;
  body: string;
  fromName?: string | null;
  linkUrl?: string | null;
}) {
  const cta = notificationCtaLabel(input.type);
  const isCommentLike = COMMENT_TYPES.has(input.type);
  const fromLabel = input.fromName?.trim() || null;

  const textParts = [`Hi ${input.firstName},`, "", input.title, ""];
  if (fromLabel && isCommentLike) {
    textParts.push(`${fromLabel} wrote:`, "");
  }
  if (input.body) {
    textParts.push(input.body, "");
  }
  if (input.linkUrl) {
    textParts.push(`${cta}: ${input.linkUrl}`, "");
  }
  textParts.push("— Parallel");
  const text = textParts.join("\n");

  const commentCard = isCommentLike
    ? `
    <div style="margin:0 0 24px;border:1px solid #e8e8ec;border-radius:12px;background:#f7f6f4;overflow:hidden;">
      ${
        fromLabel
          ? `<div style="padding:12px 16px 0;font-size:13px;font-weight:600;color:#0f1117;">${escapeHtml(fromLabel)}</div>`
          : ""
      }
      <div style="padding:12px 16px 16px;font-size:15px;line-height:1.55;color:#0f1117;">${formatEmailMultiline(input.body || input.title)}</div>
    </div>`
    : input.body
      ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#0f1117;">${formatEmailMultiline(input.body)}</p>`
      : "";

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f1117;background:#ffffff;max-width:520px;margin:0 auto;padding:24px;">
    <p style="font-size:20px;font-weight:700;margin:0 0 20px;">parallel<span style="color:#e8420a;">.</span></p>
    <p style="margin:0 0 8px;">Hi ${escapeHtml(input.firstName)},</p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#0f1117;">${escapeHtml(input.title)}</p>
    ${commentCard}
    ${
      input.linkUrl
        ? `<p style="margin:0 0 28px;">
      <a href="${escapeHtml(input.linkUrl)}" style="display:inline-block;background:#e8420a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
        ${escapeHtml(cta)}
      </a>
    </p>`
        : ""
    }
    <p style="margin:0;font-size:13px;color:#6b6b72;">— Parallel</p>
  </div>
  `.trim();

  return { text, html };
}

export async function notifyUser(input: NotifyInput) {
  const supabase = await createClient();

  const notificationBody = (input.body ?? "").trim().slice(0, 280) || null;

  const { error } = await supabase.rpc("create_notification", {
    p_user_id: input.userId,
    p_type: input.type,
    p_title: input.title,
    p_body: notificationBody,
    p_link: input.link ?? null,
  });

  if (error) {
    console.error("create_notification failed:", error.message);
  }

  let email = input.email;
  let fullName: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", input.userId)
    .maybeSingle();
  if (!email) {
    email = profile?.email;
  }
  fullName = profile?.full_name ?? null;

  if (email) {
    const linkUrl = input.link ? absoluteAppUrl(input.link) : null;
    const emailBody = (input.emailBody ?? input.body ?? "").trim();
    const firstName = firstNameFromProfile(fullName, email);
    const { text, html } = buildNotificationEmail({
      firstName,
      type: input.type,
      title: input.title,
      body: emailBody || input.title,
      fromName: input.fromName,
      linkUrl,
    });
    await sendEmail(email, input.title, text, html);
  }
}

export async function logActivity(input: {
  projectId: string;
  actorId: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
  clientVisible?: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_activity", {
    p_project_id: input.projectId,
    p_actor_id: input.actorId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_action: input.action,
    p_summary: input.summary,
    p_metadata: input.metadata ?? {},
    p_client_visible: input.clientVisible ?? false,
  });

  if (error) {
    console.error("log_activity failed:", error.message);
  }
}

export async function sendSignInCode(
  email: string,
  profile?: { fullName?: string; title?: string },
) {
  const supabase = await createClient();

  const data: Record<string, string> = {};
  if (profile?.fullName?.trim()) {
    data.full_name = profile.fullName.trim();
  }
  if (profile?.title?.trim()) {
    data.title = profile.title.trim();
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      data,
    },
  });

  if (error) {
    console.error("sign-in code email failed:", error.message);
    return { error: error.message };
  }

  return { success: true as const };
}

export { appUrl } from "@/lib/app-url";
