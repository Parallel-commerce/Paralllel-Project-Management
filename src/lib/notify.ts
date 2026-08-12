import { Resend } from "resend";

import { createClient } from "@/lib/supabase/server";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  email?: string | null;
};

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL || "Parallel <onboarding@resend.dev>";

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
  const origin = appUrl().startsWith("http")
    ? appUrl()
    : `https://${appUrl()}`;
  const loginUrl = `${origin}/login`;
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

export async function notifyUser(input: NotifyInput) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("create_notification", {
    p_user_id: input.userId,
    p_type: input.type,
    p_title: input.title,
    p_body: input.body ?? null,
    p_link: input.link ?? null,
  });

  if (error) {
    console.error("create_notification failed:", error.message);
  }

  let email = input.email;
  if (!email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", input.userId)
      .maybeSingle();
    email = profile?.email;
  }

  if (email) {
    const linkLine = input.link
      ? `\n\nView: ${appUrl()}${input.link.startsWith("/") ? input.link : `/${input.link}`}`
      : "";
    await sendEmail(
      email,
      input.title,
      `${input.body ?? input.title}${linkLine}`,
    );
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

export async function sendInviteMagicLink(
  email: string,
  nextPath = "/home",
  profile?: { fullName?: string; title?: string },
) {
  const supabase = await createClient();
  const origin = appUrl().startsWith("http")
    ? appUrl()
    : `https://${appUrl()}`;

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
      // Use /auth/confirm so invite links work across devices (token_hash flow).
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    console.error("invite magic link failed:", error.message);
    return { error: error.message };
  }

  return { success: true as const };
}

export { appUrl };
